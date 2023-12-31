import { exit } from "process";
import { WhatsAppClient } from "./Infra/WhatsApp/WhatsAppClient";
import { CompositeMessageHandler } from "./MessageHandlers/CompositeMessageHandler";
import { FaceRecognitionDestinationHandshakeMessageHandler } from "./MessageHandlers/FaceRecognition/FaceRecognitionDestinationHandshakeMessageHandler";
import { FaceRecognitionManagementMessageHandler } from "./MessageHandlers/FaceRecognition/FaceRecognitionManagementMessageHandler";
import { FaceRecognitionMessageHandler } from "./MessageHandlers/FaceRecognition/FaceRecognitionMessageHandler";
import { FaceRecognitionTrainingMessageHandler } from "./MessageHandlers/FaceRecognition/FaceRecognitionTrainingMessageHandler";
import { ManagementMessageHandler, StopBotRequestErrorCde as StopBotRequestErrorCode } from "./MessageHandlers/ManagementMessageHandler";
import { IMessageSourceScopeRepository, getMessageSourceScopeRepository } from "./Persistency/MessageSourceScopeRepository";
import { IRecognizedFaceRepository, getRecognizedFaceRepositoryAsync } from "./Persistency/RecognizedFaceRepository";
import { Client } from "whatsapp-web.js";
import { FaceManagementCommand, IFaceRecognitionManagementCommandHandler, getCommandHandlers } from "./MessageHandlers/FaceRecognition/FaceRecognitionManagementCommandHandler";
import { getFaceDescriptorRepositoryAsync } from "./Persistency/FaceDescriptorRepository";
import { AzStorageClients } from "./Infra/AzureStorage/AzStorageClients";
import { createCreateFaceRecognitionClientAsync } from "./Infra/FaceRecognitionClients/FaceRecognitionClientFactory";



export interface BotStartupParameters {
    AzureFaceApiKey?: string;
    AzureFaceEndoint?: string;
    AzureStorageAccountName: string;
    AzureStorageAccountKey: string;
    StartApiService: boolean
}

export interface BotStartupResult {
    managementCommandHandlers: Map<FaceManagementCommand, IFaceRecognitionManagementCommandHandler>;
    scopesRepo: IMessageSourceScopeRepository;
    facesRepo: IRecognizedFaceRepository;
    usedCachedAuthentication: boolean;
    whatsAppClient: Client;
}

export class BotService {
    public static async startAsync(parameters: BotStartupParameters, onQrReceived: (qr: string) => void, onReady: (startupResult: BotStartupResult) => void) {
        let qrGenerated = false;
        AzStorageClients.initialize(parameters.AzureStorageAccountName, parameters.AzureStorageAccountKey);
        let faceDescriptorsRepo = await getFaceDescriptorRepositoryAsync();
        let faceRecognitionClient = await createCreateFaceRecognitionClientAsync(faceDescriptorsRepo, {
            azureFaceApiEndpoint: parameters.AzureFaceEndoint,
            azureFaceApiKey: parameters.AzureFaceApiKey
        });

        let whatsAppClient = WhatsAppClient.getInstance();
        let facesRepo = await getRecognizedFaceRepositoryAsync();
        let scopesRepo = await getMessageSourceScopeRepository();

        let commandHandlers = getCommandHandlers(faceRecognitionClient, facesRepo, scopesRepo);
        let faceMgmtHandler = new FaceRecognitionManagementMessageHandler(commandHandlers);

        let messageHandler = new CompositeMessageHandler([
            new FaceRecognitionTrainingMessageHandler(faceRecognitionClient, facesRepo),
            new FaceRecognitionMessageHandler(faceRecognitionClient, facesRepo),
            faceMgmtHandler,
            new FaceRecognitionDestinationHandshakeMessageHandler(facesRepo),
            new ManagementMessageHandler(scopesRepo)]);

        whatsAppClient.on('message_create', async message => {
            try {
                if (!message) {
                    return;
                }

                let chat = await message.getChat();
                let scope = await scopesRepo.getAsync(chat.id._serialized);
                await messageHandler.handleAsync(message, scope);
            } catch (error: any) {
                console.log("An error has occured while handling message. Error: " + error);

                if (error.message = StopBotRequestErrorCode) {
                    exit;
                }
            }
        });

        whatsAppClient.on('ready', () => {
            if (!qrGenerated) {
                onReady({
                    managementCommandHandlers: commandHandlers,
                    scopesRepo,
                    facesRepo,
                    usedCachedAuthentication: !qrGenerated,
                    whatsAppClient
                });
            }
        });

        whatsAppClient.on('qr', qr => {
            console.log(`To connect the bot, open the link in a browser and scan the QR with your mobile WhatsApp app\nhttps://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`);
            qrGenerated = true;
            onQrReceived(qr);
        })

        await whatsAppClient.initialize();
    }

    public static async getBotStateAsync() {
        return await WhatsAppClient.getInstance().getState();
    }
}