import { createReadStream } from "streamifier";
import { Message } from "whatsapp-web.js";
import { IRecognizedFaceRepository } from "../../Persistency/RecognizedFaceRepository";
import { MessageSourceScope } from "../../Persistency/MessageSourceScopeRepository";
import { IWhatsAppMessageHandler } from "../IWhatsAppMessageHandler";
import { AzureFaceRecognitionClient } from "../../Infra/AzureFaceRecognition/AzureFaceRecognitionClient";
import { convertWhatsAppGroupIdToPersonGroupId } from "../../Infra/AzureFaceRecognition/FaceRecognitionContracts";
import { WhatsAppMessagingUtils } from '../../Infra/Utilities/WhatsAppMessagingUtils';

export class FaceRecognitionTrainingMessageHandler implements IWhatsAppMessageHandler {
    constructor(faceRecognitionClient: AzureFaceRecognitionClient, recognizedFaceRepo: IRecognizedFaceRepository) {
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
            let stream = createReadStream(buffer);

            trainedFaces.push(recognizedFace.faceName);
            await this._faceClient.trainAsync(convertWhatsAppGroupIdToPersonGroupId(recognizedFace.sourceWhatsAppId!), recognizedFace.faceId!, stream);
        }

        await WhatsAppMessagingUtils.setTypingAndReplyAsync(message, `Trained ${trainedFaces.length} faces: ${trainedFaces.join(", ")} `, 2 * 1000);

        return true;
    }

    private _faceRepo: IRecognizedFaceRepository;
    private _faceClient: AzureFaceRecognitionClient;
}

