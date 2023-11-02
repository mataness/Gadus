import { Message, Client } from "whatsapp-web.js";
import { MessageSourceScope } from "../Persistency/MessageSourceScopeRepository";

export interface IWhatsAppMessageHandler {
    handleAsync(message : Message, scope: MessageSourceScope) : Promise<boolean>
}