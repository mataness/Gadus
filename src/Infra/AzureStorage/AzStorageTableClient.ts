import { TableClient, AzureNamedKeyCredential, odata, TableEntity } from "@azure/data-tables";

let credentials: AzureNamedKeyCredential;
export const initializeStorageService = (storageAccountName: string, storageKey: string) => {
    credentials = new AzureNamedKeyCredential(storageAccountName, storageKey);
}

export class AzStorageTableClient<T extends TableEntity> {
    constructor(tableName: string) {
        this._tableClient = new TableClient(`https://${credentials.name}.table.core.windows.net`, tableName, credentials);
    }

    public async createTableAsync() {
        await this._tableClient.createTable();
    }
    public async addOrUpdateAsync(entity: T) {
        await this._tableClient.upsertEntity(entity, 'Replace');
    }

    public async addAsync(entity: T) {
        await this._tableClient.createEntity(entity);
    }

    public async getAsync(partitionKey: string, rowKey: string): Promise<T> {
        try {
            return await this._tableClient.getEntity(partitionKey, rowKey);
        } catch (error: any) {
            if (error.statusCode && error.statusCode == 404) {
                return null as unknown as T;
            }

            throw error;
        }
    }

    public async deleteAsync(partitionKey: string, rowKey: string) {
        await this._tableClient.deleteEntity(partitionKey, rowKey);
    }

    public async listAsync(partitionKey: string): Promise<T[]> {
        const res = await this._tableClient.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${partitionKey}` } });

        const result: any[] = []
        const iterator = res.byPage();

        for await (const page of iterator) {
            result.push(...page);
        }

        return result as unknown as T[];
    }

    public async queryAsync(query?: string): Promise<T[]> {
        const res = query ? await this._tableClient.listEntities({ queryOptions: { filter: query } }) : await this._tableClient.listEntities();

        const result: any[] = []
        const iterator = res.byPage();

        for await (const page of iterator) {
            result.push(...page);
        }

        return result as unknown as T[];
    }


    private _tableClient: TableClient;
}