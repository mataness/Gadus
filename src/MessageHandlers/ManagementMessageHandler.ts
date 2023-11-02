import { Message } from "whatsapp-web.js";
import { MessageSourceScope } from '../Persistency/MessageSourceScopeRepository';
import { IWhatsAppMessageHandler } from './IWhatsAppMessageHandler';
import { WhatsAppClient } from '../Infra/WhatsApp/WhatsAppClient';
import { WhatsAppMessagingUtils } from "../Infra/Utilities/WhatsAppMessagingUtils";

export const StopBotRequestErrorCde = "StopBot";

export enum ManagementCommands {
    '!ping' = '!ping',
    '!kill' = '!kill',
    '!searchchat' = '!searchchat'
};

const commands = Object.keys(ManagementCommands);

const tryGetCommand = (message: Message) => commands.find(c => message.body.startsWith(c));

export class ManagementMessageHandler implements IWhatsAppMessageHandler {
    public async handleAsync(message: Message, scope: MessageSourceScope): Promise<boolean> {
        if (!(((message.from == WhatsAppClient.getInstance().info.wid._serialized) || (scope && scope.scopes.includes("bot-management"))) && message.body && tryGetCommand(message))) {
            return false;
        }

        const command = tryGetCommand(message);

        switch (command) {
            case ManagementCommands['!kill']:
                await message.reply("Killing bot");
                console.log("Killing bot..");
                await WhatsAppClient.getInstance().destroy();
                throw new Error(StopBotRequestErrorCde);

            case ManagementCommands['!ping']:
                await message.reply("pong :D");
                break;
            
            case ManagementCommands["!searchchat"]:
                let searchText = message.body.slice(ManagementCommands["!searchchat"].toString().length + 1);
                const chats = await WhatsAppClient.getInstance().getChats();
                let chat = chats.filter(c => c.name.includes(searchText)).map(c => "Chat name:" + c.name + "chat ID:" + c.id._serialized).join("\n");

                await WhatsAppMessagingUtils.setTypingAndReplyAsync(message, chat, 7 * 1000);
        }

        return true;
    }
}
