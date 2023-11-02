import { Message } from "whatsapp-web.js";
import { MessageSourceScope } from "../Persistency/MessageSourceScopeRepository";
import { IWhatsAppMessageHandler } from "./IWhatsAppMessageHandler";

export class CompositeMessageHandler implements IWhatsAppMessageHandler {
    constructor(private _handlers: IWhatsAppMessageHandler[]) {
    }
    public async handleAsync(message: Message, scope: MessageSourceScope): Promise<boolean> {
        for (const handler of this._handlers) {
            if(await handler.handleAsync(message, scope))
            {
                return true;
            }
        }

        return false;
    }
}