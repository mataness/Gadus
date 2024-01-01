import { Cache, CacheClass } from "memory-cache";
import { TableEntity, odata } from "@azure/data-tables";
import { AzStorageTableClient } from "../Infra/AzureStorage/AzStorageTableClient";

export const getRecognizedFaceRepositoryAsync = async () => {
    let repo = new RecognizedFaceRepository();
    await repo.initializeAsync();

    return new MemCacheRecognizedFaceRepository(repo);
};

const cachingInterval = 30000;

export interface RecognizedFace extends TableEntity {
    ownerWhatsAppId: string;
    faceId: string;
    destinationWhatsAppId?: string;
    sourceWhatsAppId: string;
    faceName: string;
    authCode : string;
}

export interface IRecognizedFaceRepository {
    addOrUpdateAsync(face: RecognizedFace): Promise<void>;
    addAsync(face: RecognizedFace): Promise<void>;
    getAsync(ownerWhatsAppId: string, faceName: string): Promise<RecognizedFace>
    listAllAsync(): Promise<RecognizedFace[]>
    listByOwnerAsync(ownerWhatsAppId: string): Promise<RecognizedFace[]>
    listBySourceAsync(sourceWhatsAppId: string): Promise<RecognizedFace[]>
    deleteAsync(ownerWhatsAppId: string, faceName: string): Promise<void>
}

export class MemCacheRecognizedFaceRepository implements IRecognizedFaceRepository {
    constructor(decoratee : IRecognizedFaceRepository) {
        this._decoratee = decoratee;
        this._memCache = new Cache() as unknown as CacheClass<string, any>;
    }

    public async addOrUpdateAsync(face: RecognizedFace): Promise<void> {
        await this._decoratee.addOrUpdateAsync(face);
    }

    public async addAsync(face: RecognizedFace): Promise<void> {
        await this._decoratee.addAsync(face);
    }

    public async getAsync(ownerWhatsAppId: string, faceName: string): Promise<RecognizedFace> {
        const key = `${ownerWhatsAppId}_${faceName}`;
        let res = this._memCache.get(key);

        if (res) {
            return res;
        }

        res = await this._decoratee.getAsync(ownerWhatsAppId, faceName);

        if (res) {
            this._memCache.put(key, res, cachingInterval);
        }

        return res;
    }

    public async listAllAsync(): Promise<RecognizedFace[]> {
        return await this._decoratee.listAllAsync();
    }

    public async listByOwnerAsync(ownerWhatsAppId: string): Promise<RecognizedFace[]> {

        const key = ownerWhatsAppId;
        let res = this._memCache.get(key);

        if (res) {
            return res;
        }

        res = await this._decoratee.listByOwnerAsync(ownerWhatsAppId);

        if (res && res.length > 0) {
            this._memCache.put(key, res, cachingInterval);
        }

        return res;
    }

    public async listBySourceAsync(sourceWhatsAppId: string) {
        const key = sourceWhatsAppId;
        let res = this._memCache.get(key);

        if (res) {
            return res;
        }

        res = await this._decoratee.listBySourceAsync(sourceWhatsAppId);

        if (res && res.length > 0) {
            this._memCache.put(key, res, cachingInterval);
        }

        return res;
    }

    deleteAsync(ownerWhatsAppId: string, faceName: string): Promise<void> {
        this._memCache.del(`${ownerWhatsAppId}_${faceName}`);

        return this._decoratee.deleteAsync(ownerWhatsAppId, faceName);
    }

    private _decoratee: IRecognizedFaceRepository;
    private _memCache: CacheClass<string, any>;
}

export class RecognizedFaceRepository implements IRecognizedFaceRepository {
    constructor() {
        this._tableClient = new AzStorageTableClient("recognizedfaces");
    }

    public async initializeAsync() {
        await this._tableClient.createTableAsync();
    }

    public async addOrUpdateAsync(face: RecognizedFace) {
        face.partitionKey = face.ownerWhatsAppId;
        face.rowKey = face.faceName;

        await this._tableClient.addOrUpdateAsync(face);
    }

    public async addAsync(face: RecognizedFace): Promise<void> {
        await this._tableClient.addAsync(face);
    }

    public async getAsync(ownerWhatsAppId: string, faceName: string) {
        return await this._tableClient.getAsync(ownerWhatsAppId, faceName);
    }

    public async listAllAsync(): Promise<RecognizedFace[]> {
        return await this._tableClient.queryAsync();
    }

    public async listByOwnerAsync(ownerWhatsAppId: string) {
        return await this._tableClient.listAsync(ownerWhatsAppId);
    }

    public async listBySourceAsync(sourceWhatsAppId: string) {
        return await this._tableClient.queryAsync(odata`sourceWhatsAppId eq ${sourceWhatsAppId}`)
    }

    public async deleteAsync(ownerWhatsAppId: string, faceName: string) {
        await this._tableClient.deleteAsync(ownerWhatsAppId, faceName);
    }

    private readonly _tableClient: AzStorageTableClient<RecognizedFace>;
}