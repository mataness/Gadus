import { TableEntity } from "@azure/data-tables";
import { AzStorageTableClient } from "../Infra/AzureStorage/AzStorageTableClient";
import * as compressor from 'lz-string';

export const getFaceMatcherRepositoryAsync = async () => {
    let repo = new FaceMatcherRepository();
    await repo.createTableAsync();

    return repo;
};

export interface FaceMatcherData extends TableEntity {
    groupId: string;
    data: string;
    isTraining?: boolean;
    timeStamp?: Date;
    etag?: string;
}

export interface IFaceMatcherRepository {
    addOrUpdateAsync(face: FaceMatcherData): Promise<void>;
    updateAsync(face: FaceMatcherData): Promise<string>;
    addAsync(face: FaceMatcherData): Promise<void>;
    getAsync(groupId: string): Promise<FaceMatcherData>
    listAllAsync(): Promise<FaceMatcherData[]>
    deleteAsync(groupId: string): Promise<void>
}

export class FaceMatcherRepository implements IFaceMatcherRepository {
    constructor() {
        this._tableClient = new AzStorageTableClient("FaceMatchers");
    }

    public async createTableAsync() {
        return await this._tableClient.createTableAsync();
    }

    public async addOrUpdateAsync(face: FaceMatcherData) {
        face.partitionKey = face.groupId;
        face.rowKey = face.groupId;
        this._encode(face);
        await this._tableClient.addOrUpdateAsync(face);
        this._decode(face);
    }

    public async updateAsync(face: FaceMatcherData): Promise<string> {
        face.partitionKey = face.groupId;
        face.rowKey = face.groupId;
        this._encode(face);
        let etag = await this._tableClient.updateAsync(face, face.etag);
        this._decode(face);

        return etag;
    }


    public async addAsync(face: FaceMatcherData): Promise<void> {
        this._encode(face);
        face.partitionKey = face.groupId;
        face.rowKey = face.groupId;
        await this._tableClient.addAsync(face);
        this._decode(face);
    }

    public async getAsync(faceId: string) {
        let res = await this._tableClient.getAsync(faceId, faceId);
        this._decode(res);

        return res;
    }

    public async listAllAsync(): Promise<FaceMatcherData[]> {
        let result = await this._tableClient.queryAsync();
        result.forEach(res => {
            this._decode(res);
        })

        return result;
    }

    public async deleteAsync(faceId: string) {
        await this._tableClient.deleteAsync(faceId, faceId);
    }

    private _encode(face: FaceMatcherData) {
        if (face.descriptor) {
            face.descriptor = compressor.compressToBase64(face.data);
        }
    }

    private _decode(face: FaceMatcherData) {
        if (face.descriptor) {
            face.descriptor = compressor.decompressFromBase64(face.data);
        }
    }

    private _tableClient: AzStorageTableClient<FaceMatcherData>;
}