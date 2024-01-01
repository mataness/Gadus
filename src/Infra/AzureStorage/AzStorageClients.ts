import { AzureNamedKeyCredential, TableClient } from "@azure/data-tables";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";

export let tableCredentials: AzureNamedKeyCredential;
export let blobCredentials: StorageSharedKeyCredential;



export class AzStorageClients {
    public static initialize(storageAccountName: string, storageKey: string) {
        this._tableCredentials = new AzureNamedKeyCredential(storageAccountName, storageKey);

        blobCredentials = new StorageSharedKeyCredential(storageAccountName, storageKey);
        this._blobServiceClient = new BlobServiceClient(`https://${storageAccountName}.blob.core.windows.net`, blobCredentials);
    }

    public static getBlobServiceClient() {
        return this._blobServiceClient;
    }

    public static getTableClientClient(tableName: string) {
        return new TableClient(`https://${this._tableCredentials.name}.table.core.windows.net`, tableName, this._tableCredentials)
    }

    private static _blobServiceClient: BlobServiceClient;
    private static _tableCredentials: AzureNamedKeyCredential;
}