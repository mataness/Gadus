import { createReadStream } from 'fs';
import { Client, Message } from "whatsapp-web.js";
import { RecognizedFace, IRecognizedFaceRepository } from "../../Persistency/RecognizedFaceRepository";
import { MessageSourceScope, IMessageSourceScopeRepository, MessageSourceScopeType, addScopeIfDoesntExistAsync } from "../../Persistency/MessageSourceScopeRepository";
import { IWhatsAppMessageHandler } from "../IWhatsAppMessageHandler";
import { connectDestinationChatCommand, convertWhatsAppGroupIdToPersonGroupId } from "../../Infra/FaceRecognitionClients/FaceRecognitionContracts";
import { WhatsAppClient } from '../../Infra/WhatsApp/WhatsAppClient';
import { WhatsAppMessagingUtils } from '../../Infra/Utilities/WhatsAppMessagingUtils';
import { DeleteCommandHandler, FaceManagementCommand, IFaceRecognitionManagementCommandHandler } from './FaceRecognitionManagementCommandHandler';




export class FaceRecognitionManagementMessageHandler implements IWhatsAppMessageHandler {
    constructor(commandHandlers : Map<FaceManagementCommand, IFaceRecognitionManagementCommandHandler>) {
        this._commandHandlers = commandHandlers;
    }

    public async handleCommandAsync(command: FaceManagementCommand, payload: string[]) {
        let commandHandler = this._commandHandlers.get(command);

        await commandHandler?.handleWithoutReplyAsync(payload);
    }

    public async handleAsync(message: Message, scope: MessageSourceScope): Promise<boolean> {
        if (!((message.fromMe || (scope && scope.scopes.includes("bot-management"))) && message.body && message.body.startsWith("!fmanage"))) {
            return false;
        }

        let commandSplitted = message.body.split(" ");
        let command = commandSplitted[1] as FaceManagementCommand;
        let commandHandler = this._commandHandlers.get(command);

        if (commandHandler) {
            await commandHandler.handleAsync(message, commandSplitted.slice(2))
        }

        return true;
    }

    private _commandHandlers: Map<FaceManagementCommand, IFaceRecognitionManagementCommandHandler>;
}
