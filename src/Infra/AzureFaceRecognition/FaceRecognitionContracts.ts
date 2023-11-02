import { StringUtils } from "../Utilities/StringUtils";

export const convertWhatsAppGroupIdToPersonGroupId = (whatsappGroupId: string) => {
    return StringUtils.hash(whatsappGroupId);
}

export const connectDestinationChatCommand = "!gconnect";