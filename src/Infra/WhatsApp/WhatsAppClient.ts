import { Client, LocalAuth } from "whatsapp-web.js";

export class WhatsAppClient {
    public static getInstance() {
        if (!this._client) {
            this._client = new Client({
                authStrategy: new LocalAuth({
                    dataPath: "/opt/whatsapp_auth"
                }),
                puppeteer: {
                    args: ['--no-sandbox', "--disabled-setupid-sandbox"]
                }
            });

            this._client.on('authenticated', (authenticated) => {
                console.log("Authenticated!", authenticated);
            });

            this._client.on('disconnected', (disconnected) => {
                console.log("disconnected!", disconnected);
            });

            this._client.on('ready', () => {
                console.log('Client is ready!');
            });
        }

        return this._client;
    }

    private static _client: Client;
}

