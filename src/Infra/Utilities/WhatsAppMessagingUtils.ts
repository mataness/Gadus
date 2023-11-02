import { Chat, Message } from "whatsapp-web.js";
import { delay } from "@azure/ms-rest-js";

export class WhatsAppMessagingUtils {
    public static getAuthor(message : Message) {
        return message.author || message.from;
    }

    public static formatNumberToWhatsAppId(number : string) {
        return number + "@c.us";
    }

    public static getWhatsAppNumberFromId(number : string) {
        return number.split("@")[0];
    }

    public static async setTypingAndReplyAsync(message: Message, text : string, typeWaitTimeMs : number) {
        let chat = await message.getChat();

        await chat.sendStateTyping();
        await delay(typeWaitTimeMs);
        await chat.clearState();
        await message.reply(text);
    }

    public static async setTypingAndSendAsync(chat : Chat, text : string, typeWaitTimeMs : number) {
        await chat.sendStateTyping();
        await delay(typeWaitTimeMs);
        await chat.clearState();
        await chat.sendMessage(text);
    }
}