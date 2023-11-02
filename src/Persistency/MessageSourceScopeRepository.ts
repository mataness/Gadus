import { Cache, CacheClass } from "memory-cache";
import { AzStorageTableClient } from "../Infra/AzureStorage/AzStorageTableClient";
import { TableEntity } from "@azure/data-tables";

export const addScopeIfDoesntExistAsync = async (scopesRepo: IMessageSourceScopeRepository, whatsAppId: string, scope: MessageSourceScopeType) => {
    let currentSourceScope = await scopesRepo.getAsync(whatsAppId);

    if (currentSourceScope != null && !currentSourceScope.scopes.includes(scope)) {
        currentSourceScope.scopes.push(scope);
        await scopesRepo.addOrUpdateAsync(currentSourceScope);
    } else if (currentSourceScope == null) {
        let newScope: MessageSourceScope = {
            sourceId: whatsAppId,
            scopes: [scope],
            partitionKey: "",
            rowKey: whatsAppId
        }

        await scopesRepo.addAsync(newScope);
    }
}

export const getMessageSourceScopeRepository = () => new MemCacheSourceScopeRepository(new MessageSourceScopeRepository());


export type MessageSourceScopeType = "face-recognition" | "bot-management" | "face-recognition-management" | "face-owner";

export interface MessageSourceScope extends TableEntity {
    sourceId: string;
    scopes: MessageSourceScopeType[]
}

export interface IMessageSourceScopeRepository {
    addOrUpdateAsync(scope: MessageSourceScope): Promise<void>;
    addAsync(scope: MessageSourceScope): Promise<void>;
    getAsync(messageSourceId: string): Promise<MessageSourceScope>;
    deleteAsync(messageSourceId: string): Promise<void>;
}

export class MemCacheSourceScopeRepository implements IMessageSourceScopeRepository {
    constructor(decoratee: IMessageSourceScopeRepository) {
        this._decoratee = decoratee;
        this._memCache = new Cache() as unknown as CacheClass<string, any>;
    }
    public async addOrUpdateAsync(scope: MessageSourceScope): Promise<void> {
        this._memCache.del(scope.sourceId);
        await this._decoratee.addOrUpdateAsync(scope);
    }

    public async addAsync(scope: MessageSourceScope): Promise<void> {
        await this._decoratee.addAsync(scope);
    }

    public async getAsync(messageSourceid: string): Promise<MessageSourceScope> {
        let res = this._memCache.get(messageSourceid);

        if (res) {
            return res;
        }

        res = await this._decoratee.getAsync(messageSourceid);

        if (res) {
            this._memCache.put(messageSourceid, res, 30000);
        }

        return res;
    }
    public async deleteAsync(messageSourceid: string): Promise<void> {
        this._memCache.del(messageSourceid);
        await this._decoratee.deleteAsync(messageSourceid);
    }

    private _memCache: CacheClass<string, MessageSourceScope>;
    private _decoratee: IMessageSourceScopeRepository;
}

export class MessageSourceScopeRepository implements IMessageSourceScopeRepository {
    constructor() {
        this._tableClient = new AzStorageTableClient("scopes");
    }

    public async addOrUpdateAsync(scope: MessageSourceScope) {
        await this.addOrUpdateInternalAsync(scope, true);
    }

    public async addAsync(scope: MessageSourceScope): Promise<void> {
        await this.addOrUpdateInternalAsync(scope, false);
    }

    public async getAsync(messageSourceId: string) {
        let res = await this._tableClient.getAsync("", messageSourceId);

        if (res != null && res.scopes != null) {
            let scopes = JSON.parse(res.scopes as any)
            res.scopes = scopes;
        }

        return res;
    }

    public async deleteAsync(messageSourceId: string) {
        await this._tableClient.deleteAsync("", messageSourceId);
    }

    private async addOrUpdateInternalAsync(scope: MessageSourceScope, allowUpdate: boolean): Promise<void> {

        let originalScope = scope.scopes;
        let x = JSON.stringify(scope.scopes);
        scope.partitionKey = "";
        scope.rowKey = scope.sourceId;
        scope.scopes = x as any;

        if (allowUpdate) {
            await this._tableClient.addOrUpdateAsync(scope);
        } else {
            await this._tableClient.addAsync(scope);

        }
        scope.scopes = originalScope;
    }

    private _tableClient: AzStorageTableClient<MessageSourceScope>;
}