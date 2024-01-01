import { Message } from "whatsapp-web.js";
import { IRecognizedFaceRepository } from "../../Persistency/RecognizedFaceRepository";
import { MessageSourceScope } from "../../Persistency/MessageSourceScopeRepository";
import { IWhatsAppMessageHandler } from "../IWhatsAppMessageHandler";
import { connectDestinationChatCommand } from "../../Infra/FaceRecognitionClients/FaceRecognitionContracts";
import { WhatsAppMessagingUtils } from '../../Infra/Utilities/WhatsAppMessagingUtils';

export class FaceRecognitionDestinationHandshakeMessageHandler implements IWhatsAppMessageHandler {
    constructor(recognizedFaceRepo: IRecognizedFaceRepository) {
        this._faceRepo = recognizedFaceRepo;
    }

    public async handleAsync(message: Message, scope: MessageSourceScope): Promise<boolean> {
        if (!message.body || !message.body.startsWith(connectDestinationChatCommand)) {
            return false;
        }

        const messageSplitted = message.body.split(" ");

        if (messageSplitted.length < 3) {
            return true;
        }

        const faceName = messageSplitted[1];
        const authCode = messageSplitted[2];
        const face = await this._faceRepo.getAsync(WhatsAppMessagingUtils.getAuthor(message), faceName);

        if (!face || face.authCode == null || face.authCode != authCode) {
            return true;
        }

        face.authCode = null as unknown as string;
        face.destinationWhatsAppId = message.from;
        await this._faceRepo.addOrUpdateAsync(face);

        await message.reply("Done");

        return true;
    }

    private _faceRepo: IRecognizedFaceRepository;
}
