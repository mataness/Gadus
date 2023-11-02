import { ApiService } from "./ApiService";
import { BotService, BotStartupParameters } from "./BotService";
import { parseArgs } from "node:util";

let startUpParams = parseArgs({
    options: {
        AzureFaceApiKey: {
            type: "string",
            required: true
        },
        AzureFaceEndoint: {
            type: "string",
            required: true
        },
        AzureStorageAccountName: {
            type: "string",
            required: true
        },
        AzureStorageAccountKey: {
            type: "string",
        },
        StartApiService: {
            type: "boolean",
            default: false
        },
    },
});



if (startUpParams.values.StartApiService) {
    new ApiService(startUpParams.values as BotStartupParameters).start(5000);
} else {
    console.log("API service is disabled");

    BotService.startAsync(startUpParams.values as BotStartupParameters, qrReceived => console.log(qrReceived), () => { });
}