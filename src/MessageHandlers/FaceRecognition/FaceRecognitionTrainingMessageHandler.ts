import { Message } from "whatsapp-web.js";
import { IRecognizedFaceRepository } from "../../Persistency/RecognizedFaceRepository";
import { MessageSourceScope } from "../../Persistency/MessageSourceScopeRepository";
import { IWhatsAppMessageHandler } from "../IWhatsAppMessageHandler";
import { convertWhatsAppGroupIdToPersonGroupId } from "../../Infra/FaceRecognitionClients/FaceRecognitionContracts";
import { WhatsAppMessagingUtils } from '../../Infra/Utilities/WhatsAppMessagingUtils';
import { FaceRecognitionClient } from "../../Infra/FaceRecognitionClients/FaceRecognitionClient";

export class FaceRecognitionTrainingMessageHandler implements IWhatsAppMessageHandler {
    constructor(faceRecognitionClient: FaceRecognitionClient, recognizedFaceRepo: IRecognizedFaceRepository) {
        this._faceRepo = recognizedFaceRepo;
        this._faceClient = faceRecognitionClient;
    }

    public async handleAsync(message: Message, scope: MessageSourceScope): Promise<boolean> {
        if (!(scope && scope.scopes.includes('face-owner') && message.hasMedia)) {
            return false;
        }

        let faces = message.body ? message.body.split(" ") : null;

        const recognizedFaces = await this._faceRepo.listByOwnerAsync(scope.sourceId);

        if (recognizedFaces.length == 0) {
            return false;
        }

        const attachmentData = await message.downloadMedia();
        if (!attachmentData || !attachmentData.mimetype || !attachmentData.mimetype.startsWith("image")) {
            return false;
        }

        let buffer = Buffer.from(attachmentData.data, 'base64');
        let trainedFaces: string[] = [];

        for (let recognizedFace of recognizedFaces) {
            if (faces && !faces.includes(recognizedFace.faceName)) {
                continue;
            }

            trainedFaces.push(recognizedFace.faceName);
            if(!await this._faceClient.trainAsync(convertWhatsAppGroupIdToPersonGroupId(recognizedFace.sourceWhatsAppId!), recognizedFace.faceId!, buffer)) {
                await WhatsAppMessagingUtils.setTypingAndReplyAsync(message, `Failed to detect face in image`, 2 * 1000);

                return true;
            }
        }

        await WhatsAppMessagingUtils.setTypingAndReplyAsync(message, `Trained ${trainedFaces.length} faces: ${trainedFaces.join(", ")} `, 2 * 1000);

        return true;
    }

    private _faceRepo: IRecognizedFaceRepository;
    private _faceClient: FaceRecognitionClient;
}

