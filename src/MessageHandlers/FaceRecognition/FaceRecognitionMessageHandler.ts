import { Message } from "whatsapp-web.js";
import { IRecognizedFaceRepository } from "../../Persistency/RecognizedFaceRepository";
import { MessageSourceScope } from "../../Persistency/MessageSourceScopeRepository";
import { IWhatsAppMessageHandler } from "../IWhatsAppMessageHandler";
import { convertWhatsAppGroupIdToPersonGroupId } from "../../Infra/FaceRecognitionClients/FaceRecognitionContracts";
import { WhatsAppClient } from "../../Infra/WhatsApp/WhatsAppClient";
import { FaceRecognitionClient } from "../../Infra/FaceRecognitionClients/FaceRecognitionClient";

export class FaceRecognitionMessageHandler implements IWhatsAppMessageHandler {
    constructor(faceRecognitionClient: FaceRecognitionClient, recognizedFaceRepo: IRecognizedFaceRepository) {
        this._faceRepo = recognizedFaceRepo;
        this._faceClient = faceRecognitionClient;
    }

    public async handleAsync(message: Message, scope: MessageSourceScope): Promise<boolean> {
        if (!(scope && scope.scopes.includes('face-recognition') && message.hasMedia)) {
            return false;
        }

        const attachmentData = await message.downloadMedia();

        if (!attachmentData || !attachmentData.mimetype || !attachmentData.mimetype.startsWith("image")) {
            return true;
        }

        const messageSource = message.from;
        let buffer = Buffer.from(attachmentData.data, 'base64');

        const associatedFaces = await this._faceRepo.listBySourceAsync(messageSource);


        if (associatedFaces.length == 0) {
            return true;
        }

        const detectedFaces = await this._faceClient.detectAsync(buffer, convertWhatsAppGroupIdToPersonGroupId(messageSource));

        if (detectedFaces.length == 0) {
            return true;
        }

        for (let detectedFace of detectedFaces) {
            let associateFace = associatedFaces.find(f => f.faceId && f.faceId.toLowerCase() == detectedFace.toLowerCase())

            if (associateFace) {
                console.log(`Detected face ${associateFace.faceId}, sending to ${associateFace.destinationWhatsAppId!}`);
                let targetChat = await WhatsAppClient.getInstance().getChatById(associateFace.destinationWhatsAppId!);

                if(!targetChat) {
                    continue;
                }

                await message.forward(targetChat);
            }
        }

        return true;
    }

    private _faceRepo: IRecognizedFaceRepository;
    private _faceClient: FaceRecognitionClient;
}
