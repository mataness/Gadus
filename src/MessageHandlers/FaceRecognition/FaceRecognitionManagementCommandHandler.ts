import { Message } from "whatsapp-web.js";
import { RecognizedFace as RecognizedFace, IRecognizedFaceRepository } from "../../Persistency/RecognizedFaceRepository";
import { IMessageSourceScopeRepository, addScopeIfDoesntExistAsync } from "../../Persistency/MessageSourceScopeRepository";
import { WhatsAppMessagingUtils } from "../../Infra/Utilities/WhatsAppMessagingUtils";
import { connectDestinationChatCommand, convertWhatsAppGroupIdToPersonGroupId } from "../../Infra/FaceRecognitionClients/FaceRecognitionContracts";
import { v4 as uuidv4 } from 'uuid';
import { FaceRecognitionClient } from "../../Infra/FaceRecognitionClients/FaceRecognitionClient";

export type FaceManagementCommand = 'add' | 'delete' | 'delete_all';

export const getCommandHandlers = (faceRecognitionClient: FaceRecognitionClient, recognizedFaceRepo: IRecognizedFaceRepository, scopesRepo: IMessageSourceScopeRepository) => 
{
    let commandHandlers = new Map<FaceManagementCommand, IFaceRecognitionManagementCommandHandler>();

    let deleteCommand = new DeleteCommandHandler(faceRecognitionClient, recognizedFaceRepo, scopesRepo);
    let addCommand = new AddCommandHandler(faceRecognitionClient, recognizedFaceRepo, scopesRepo);
    let deleteAllCommand = new DeleteAllCommandHandler(recognizedFaceRepo, deleteCommand, faceRecognitionClient);

    commandHandlers.set(addCommand.command, addCommand);
    commandHandlers.set(deleteCommand.command, deleteCommand);
    commandHandlers.set(deleteAllCommand.command, deleteAllCommand);

    return commandHandlers;
}

export interface IFaceRecognitionManagementCommandHandler {
    handleAsync(message: Message, commandPayload: string[]): Promise<void>;
    handleWithoutReplyAsync(commandPayload: string[]): Promise<any>;
    readonly command: FaceManagementCommand;
}

export class AddCommandHandler implements IFaceRecognitionManagementCommandHandler {
    constructor(faceRecognitionClient: FaceRecognitionClient, recognizedFaceRepo: IRecognizedFaceRepository, scopesRepo: IMessageSourceScopeRepository) {
        this._faceRepo = recognizedFaceRepo;
        this._faceClient = faceRecognitionClient;
        this._scopesRepo = scopesRepo;
    }

    public readonly command = 'add';

    public async handleAsync(message: Message, commandPayload: string[]): Promise<void> {
        const newFace = (await this.handleWithoutReplyAsync(commandPayload)) as RecognizedFace;

        await WhatsAppMessagingUtils.setTypingAndReplyAsync(message, `Added. To configure the destination chat which will receive the message, make sure the bot is in the destination chat group and let the face owner type the following command in the destination chat:`, 6 * 1000);
        
        if(newFace.authCode) {
            await WhatsAppMessagingUtils.setTypingAndSendAsync(await message.getChat(), `${connectDestinationChatCommand} ${newFace.faceName} ${newFace.authCode}`, 2 * 1000);
        }
    }

    public async handleWithoutReplyAsync(commandPayload: string[]): Promise<any> {
        if (commandPayload.length < 3) {
            return;
        }

        let sourceWhatsAppId = commandPayload[2];
        let ownerWhatsAppNumber = commandPayload[0];
        let faceName = commandPayload[1];

        return await this.addAsync(ownerWhatsAppNumber, faceName, sourceWhatsAppId, commandPayload.length == 4 ? commandPayload[3] : null as unknown as string);
    }

    public async addAsync(ownerWhatsAppNumber: string, faceName: string, sourceWhatsAppId: string, destinationWhatsAppId: string) {
        const ownerWhatsAppId = WhatsAppMessagingUtils.formatNumberToWhatsAppId(ownerWhatsAppNumber);
        await addScopeIfDoesntExistAsync(this._scopesRepo, sourceWhatsAppId, 'face-recognition');
        await addScopeIfDoesntExistAsync(this._scopesRepo, ownerWhatsAppId, 'face-owner');


        const authCode = destinationWhatsAppId ? null as unknown as string : uuidv4();
        const personGroupId = convertWhatsAppGroupIdToPersonGroupId(sourceWhatsAppId);
        const faceId = await this._faceClient.createFaceAsync(personGroupId);

        const newRecognizedFace: RecognizedFace = {
            authCode,
            ownerWhatsAppId,
            partitionKey: ownerWhatsAppId,
            faceName: faceName,
            rowKey: faceName,
            sourceWhatsAppId,
            destinationWhatsAppId,
            faceId
        };

        await this._faceRepo.addAsync(newRecognizedFace);

        return newRecognizedFace;
    }

    private _faceRepo: IRecognizedFaceRepository;
    private _scopesRepo: IMessageSourceScopeRepository;
    private _faceClient: FaceRecognitionClient;
}

export class DeleteCommandHandler implements IFaceRecognitionManagementCommandHandler {
    constructor(faceRecognitionClient: FaceRecognitionClient, recognizedFaceRepo: IRecognizedFaceRepository, scopesRepo: IMessageSourceScopeRepository) {
        this._faceRepo = recognizedFaceRepo;
        this._faceClient = faceRecognitionClient;
        this._scopesRepo = scopesRepo;
    }

    public readonly command = 'delete';

    public async handleAsync(message: Message, commandPayload: string[]): Promise<void> {
        await this.handleWithoutReplyAsync(commandPayload);
        await message.reply("Deleted successfully");
    }

    public async handleWithoutReplyAsync(commandPayload: string[]): Promise<any> {
        await this.deleteAsync(WhatsAppMessagingUtils.formatNumberToWhatsAppId(commandPayload[0]), commandPayload[1]);
    }

    async deleteAsync(ownerWhatsAppId: string, faceName: string) {
        let ownerFaces = await this._faceRepo.listByOwnerAsync(ownerWhatsAppId);
        let faceToDelete = ownerFaces.find(face => face.faceName == faceName);
        if (ownerFaces.length == 0 || !faceToDelete) {
            return;
        }

        let personGroupId = convertWhatsAppGroupIdToPersonGroupId(faceToDelete.sourceWhatsAppId);
        let sourceFaces = await this._faceRepo.listBySourceAsync(faceToDelete.sourceWhatsAppId);

        if (sourceFaces.length <= 1) {
            await this._faceClient.deleteGroupAsync(personGroupId)
            await this._scopesRepo.deleteAsync(faceToDelete.sourceWhatsAppId);
        }

        await this._faceRepo.deleteAsync(ownerWhatsAppId, faceName);

        if (ownerFaces.length > 1) {
            return;
        }

        let ownerScopes = await this._scopesRepo.getAsync(ownerWhatsAppId);

        if (ownerScopes.scopes.length > 1) {
            ownerScopes.scopes = ownerScopes.scopes.filter(s => s != 'face-owner');
            await this._scopesRepo.addOrUpdateAsync(ownerScopes);

            return;
        }

        await this._scopesRepo.deleteAsync(ownerScopes.sourceId);
    }

    private _faceRepo: IRecognizedFaceRepository;
    private _scopesRepo: IMessageSourceScopeRepository;
    private _faceClient: FaceRecognitionClient;
}

export class DeleteAllCommandHandler implements IFaceRecognitionManagementCommandHandler {
    constructor(recognizedFaceRepo: IRecognizedFaceRepository, deleteCommandHandler: DeleteCommandHandler, faceClient: FaceRecognitionClient) {
        this._faceRepo = recognizedFaceRepo;
        this._faceClient = faceClient;
        this._deleteCommandHandler = deleteCommandHandler;
    }

    public readonly command = 'delete_all';

    public async handleAsync(message: Message, commandPayload: string[]): Promise<void> {
        await this.handleWithoutReplyAsync(commandPayload);
        await message.reply("Done");
    }

    public async handleWithoutReplyAsync(commandPayload: string[]): Promise<any> {
        let allFaces = await this._faceRepo.listAllAsync();

        for (let recognizedFace of allFaces) {
            await this._deleteCommandHandler.deleteAsync(recognizedFace.ownerWhatsAppId, recognizedFace.faceName);
        }

        await this._faceClient.deleteAllAsync();
    }

    private _faceRepo: IRecognizedFaceRepository;
    private _faceClient: FaceRecognitionClient;
    private _deleteCommandHandler: DeleteCommandHandler;
}