import { delay } from "@azure/ms-rest-js";
import express from "express";
import { BotService, BotStartupParameters, BotStartupResult } from "./BotService";
import { RecognizedFace, getRecognizedFaceRepository } from "./Persistency/RecognizedFaceRepository";
import { Client } from "whatsapp-web.js";
import { WhatsAppMessagingUtils } from "./Infra/Utilities/WhatsAppMessagingUtils";

const cors = require('cors');
const corsOptions = {
    origin: '*',
    credentials: true,
    optionSuccessStatus: 200,
}



export interface RecognizedFaceApiResponse {
    faceName: string,
    ownerWhatsAppNumber: string;
    destinationWhatsAppId: string;
    sourceWhatsAppId: string;
    sourceWhatsAppChatName: string;
    destinationWhatsAppChatName: string;
    faceId: string;
}

export class ApiService {
    constructor(parameters: BotStartupParameters) {
        this._qr = null as any;
        this._botStartupResult = null as any;
        this._parameters = parameters;

        this._app = express();
        this._app.use(express.json());
        this._app.use(cors(corsOptions));

        this.addBotManagementApi();
        this.addFaceApi();
        this.addChatApi();

        this._app.use(function (err: any, req: any, res: any, next: any) {
            res.format({
                'application/json': function () {
                    res.send({ error: 'internal_error' });
                }
            });
        });

    }
    public start(portNumber: number) {
        this._app.listen(portNumber);
    }

    private addChatApi() {
        this._app.get('/api/chats', async (req, res) => {
            const chats = await this._botStartupResult.whatsAppClient.getChats();

            let chatsMapped = chats.map(c => {
                return { name: c.name, id: c.id._serialized };
            });

            res.json({ chats: chatsMapped });
        });

        this._app.delete('/api/chats/:chatId', async (req, res) => {
            const chats = await this._botStartupResult.whatsAppClient.getChats();

            let chatDoDelete = chats.find(c => c.id._serialized == req.params.chatId);

            if (chatDoDelete) {
                await chatDoDelete.delete();
            }
        });
    }

    private addFaceApi() {
        this._app.get('/api/faces', async (req, res) => {
            const facesRepo = getRecognizedFaceRepository();

            let allFaces = await facesRepo.listAllAsync();
            let faces = await this.mapToFaceResponseModel(allFaces, this._botStartupResult.whatsAppClient);

            res.json({ faces });
        });

        this._app.put('/api/faces/:ownerWhatsAppNumber/:faceName', async (req, res) => {
            let owner = req.params.ownerWhatsAppNumber;
            let faceName = req.params.faceName;
            let destination = req.body.destination;
            let source = req.body.source;

            await this._botStartupResult.managementCommandHandlers.get('add')!.handleWithoutReplyAsync([owner, faceName, source, destination]);
            let allFaces = await this._botStartupResult.facesRepo.listAllAsync();
            let faces = await this.mapToFaceResponseModel(allFaces, this._botStartupResult.whatsAppClient);

            res.json({ faces });
        });

        this._app.delete('/api/faces/:ownerWhatsAppNumber/:faceName', async (req, res) => {
            let owner = req.params.ownerWhatsAppNumber;
            let faceName = req.params.faceName;
            await this._botStartupResult.managementCommandHandlers.get("delete")!.handleWithoutReplyAsync([owner, faceName])
            let allFaces = await this._botStartupResult.facesRepo.listAllAsync();
            let faces = await this.mapToFaceResponseModel(allFaces, this._botStartupResult.whatsAppClient);

            res.json({ faces });
        });
    }

    private addBotManagementApi() {
        this._app.post('/api/bot/start', async (req, res) => {
            console.log("Starting bot");

            if (!this._botStartupResult) {
                BotService.startAsync(this._parameters, qrReceived => this._qr = qrReceived, (result) => this._botStartupResult = result);
            }

            while (!this._qr && (!this._botStartupResult || !this._botStartupResult.usedCachedAuthentication)) {
                await delay(1000);
            }

            res.json({ qrCode: this._qr, usedCachedAuthentication: this._botStartupResult?.usedCachedAuthentication });
        });


        this._app.get('/api/bot/state', async (req, res) => {
            const state = await BotService.getBotStateAsync();

            res.json({ state: state == 'CONNECTED' ? "Ready" : "NotReady" });
        })
    }

    private async mapToFaceResponseModel(faces: RecognizedFace[], whatsAppClient: Client) {
        const chats = await this.getChatsAsync(whatsAppClient);

        let chatsMappedById = new Map<string, string>();

        for (let chat of chats) {
            chatsMappedById.set(chat.id, chat.name);
        }

        return faces.map(f => {
            let response: RecognizedFaceApiResponse;

            response = {
                ownerWhatsAppNumber: WhatsAppMessagingUtils.getWhatsAppNumberFromId(f.ownerWhatsAppId),
                sourceWhatsAppChatName: chatsMappedById.get(f.sourceWhatsAppId)!,
                sourceWhatsAppId: f.sourceWhatsAppId,
                destinationWhatsAppChatName: chatsMappedById.get(f.destinationWhatsAppId!)!,
                destinationWhatsAppId: f.destinationWhatsAppId!,
                faceName: f.faceName,
                faceId: f.faceId
            }

            return response;
        })
    }

    private async getChatsAsync(whatsAppClient: Client) {
        const chats = await whatsAppClient.getChats();

        let chatsMapped = chats.map(c => {
            return { name: c.name, id: c.id._serialized };
        });

        return chatsMapped;
    }

    private _app: express.Express;
    private _parameters: BotStartupParameters;
    private _qr: string;
    private _botStartupResult: BotStartupResult;
}