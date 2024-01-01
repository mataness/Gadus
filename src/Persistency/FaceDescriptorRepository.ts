import { Cache, CacheClass } from "memory-cache";
import { TableEntity, odata } from "@azure/data-tables";
import { AzStorageTableClient } from "../Infra/AzureStorage/AzStorageTableClient";
import { AzStorageClients } from "../Infra/AzureStorage/AzStorageClients";
import { ContainerClient } from "@azure/storage-blob";

export const getFaceDescriptorRepositoryAsync = async () => {
    let repo = new FaceDescriptorRepository();
    await repo.initializeAsync();

    return new MemCacheFaceDescriptorRepository(repo);
};

const cachingInterval = 30000;

export interface FaceDescriptor extends TableEntity {
    faceId: string;
    groupId: string;
    descriptor: string;
    isTraining?: boolean;
    timeStamp?: Date;
    etag?: string;
    blobEtag? :string;
}

export interface IFaceDescriptorRepository {
    addOrUpdateAsync(face: FaceDescriptor): Promise<void>;
    updateAsync(face: FaceDescriptor): Promise<string>;
    addAsync(face: FaceDescriptor): Promise<void>;
    getAsync(groupId: string, faceId: string): Promise<FaceDescriptor>
    listAllAsync(): Promise<FaceDescriptor[]>
    listByGroupAsync(groupId: string): Promise<FaceDescriptor[]>
    deleteAsync(groupId: string, faceId: string): Promise<void>
}

export class MemCacheFaceDescriptorRepository implements IFaceDescriptorRepository {
    constructor(decoratee: IFaceDescriptorRepository) {
        this._decoratee = decoratee;
        this._memCache = new Cache() as unknown as CacheClass<string, any>;
    }

    public async addOrUpdateAsync(face: FaceDescriptor): Promise<void> {
        const key = `${face.groupId}_${face.faceId}`;
        this._memCache.del(key);
        await this._decoratee.addOrUpdateAsync(face);
    }

    public async addAsync(face: FaceDescriptor): Promise<void> {
        await this._decoratee.addAsync(face);
    }

    public async updateAsync(face: FaceDescriptor): Promise<string> {
        const key = `${face.groupId}_${face.faceId}`;
        this._memCache.del(key);

        return await this._decoratee.updateAsync(face);
    }


    public async getAsync(groupId: string, faceId: string): Promise<FaceDescriptor> {
        const key = `${groupId}_${faceId}`;
        let res = this._memCache.get(key);

        if (res) {
            return res;
        }

        res = await this._decoratee.getAsync(groupId, faceId);

        if (res) {
            this._memCache.put(key, res, cachingInterval);
        }

        return res;
    }

    public async listAllAsync(): Promise<FaceDescriptor[]> {
        return await this._decoratee.listAllAsync();
    }

    public async listByGroupAsync(groupId: string) {
        const key = groupId;
        let res = this._memCache.get(key);

        if (res) {
            return res;
        }

        res = await this._decoratee.listByGroupAsync(groupId);

        if (res && res.length > 0) {
            this._memCache.put(key, res, cachingInterval);
        }

        return res;
    }

    deleteAsync(groupId: string, faceId: string): Promise<void> {
        this._memCache.del(`${groupId}_${faceId}`);

        return this._decoratee.deleteAsync(groupId, faceId);
    }

    private _decoratee: IFaceDescriptorRepository;
    private _memCache: CacheClass<string, any>;
}

export class FaceDescriptorRepository implements IFaceDescriptorRepository {
    constructor() {
        let name = "facedescriptors";
        this._tableClient = new AzStorageTableClient(name);
        this._containerClient = AzStorageClients.getBlobServiceClient().getContainerClient(name);
    }

    public async initializeAsync() {
        await this._tableClient.createTableAsync();
        await this._containerClient.createIfNotExists();
    }

    public async addOrUpdateAsync(face: FaceDescriptor) {
        face.partitionKey = face.groupId;
        face.rowKey = face.faceId;
        await this._storeDescriptorAsync(face);
        let descriptor = face.descriptor;
        face.descriptor = "";
        await this._tableClient.addOrUpdateAsync(face);
        face.descriptor = descriptor;
    }

    public async updateAsync(face: FaceDescriptor): Promise<string> {
        face.partitionKey = face.groupId;
        face.rowKey = face.faceId;
        await this._storeDescriptorAsync(face);
        let descriptor = face.descriptor;
        face.descriptor = "";
        let etag = await this._tableClient.updateAsync(face, face.etag);
        face.descriptor = descriptor;

        return etag;
    }


    public async addAsync(face: FaceDescriptor): Promise<void> {
        await this._storeDescriptorAsync(face);
        face.partitionKey = face.groupId;
        face.rowKey = face.faceId;
        let descriptor = face.descriptor;
        face.descriptor = "";
        await this._tableClient.addAsync(face);
        face.descriptor = descriptor;
    }

    public async getAsync(groupId: string, faceId: string) {
        let res = await this._tableClient.getAsync(groupId, faceId);
        await this._downloadDescriptorAsync(res);

        return res;
    }

    public async listAllAsync(): Promise<FaceDescriptor[]> {
        let result = await this._tableClient.queryAsync();

        for (let face of result) {
            await this._downloadDescriptorAsync(face);
        }

        return result;
    }

    public async listByGroupAsync(groupId: string) {
        let result = await this._tableClient.listAsync(groupId);

        for (let face of result) {
            await this._downloadDescriptorAsync(face);
        }


        return result;
    }

    public async deleteAsync(groupId: string, faceId: string) {
        await this._tableClient.deleteAsync(groupId, faceId);
        await this._deleteDescriptorAsync(faceId);
    }

    private async _storeDescriptorAsync(face: FaceDescriptor) {
        let descriptor = btoa(face.descriptor);
        let uploadResult = await this._containerClient.getBlobClient(face.faceId).getBlockBlobClient().upload(descriptor, descriptor.length, {
            conditions: {
                ifMatch: face.blobEtag
            }
        });
        face.blobEtag = uploadResult.etag;
    }

    private async _deleteDescriptorAsync(faceId : string) {
        await this._containerClient.getBlobClient(faceId).deleteIfExists();
    }

    private async _downloadDescriptorAsync(face: FaceDescriptor) {
        let downloadedData = await this._containerClient.getBlobClient(face.faceId).download();
        const downloaded = await this.streamToBuffer(downloadedData.readableStreamBody!);
        face.blobEtag = downloadedData.etag;

        face.descriptor = atob(downloaded.toString());
    }

    private async streamToBuffer(readableStream: NodeJS.ReadableStream): Promise<any> {
        return new Promise((resolve, reject) => {
            const chunks: any = [];
            readableStream.on('data', (data) => {
                chunks.push(data instanceof Buffer ? data : Buffer.from(data));
            });
            readableStream.on('end', () => {
                resolve(Buffer.concat(chunks));
            });
            readableStream.on('error', reject);
        });
    }

    private _tableClient: AzStorageTableClient<FaceDescriptor>;
    private readonly _containerClient: ContainerClient;
}