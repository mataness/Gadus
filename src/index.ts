import { ApiService } from "./ApiService";
import { BotService, BotStartupParameters } from "./BotService";

let startUpParams: BotStartupParameters = {
    AzureStorageAccountKey: process.env.AzureStorageAccountKey!,
    AzureStorageAccountName: process.env.AzureStorageAccountName!,
    StartApiService: (process.env.StartApiService && true) || false,
    AzureFaceApiKey: process.env.AzureFaceApiKey,
    AzureFaceEndoint : process.env.AzureFaceEndoint
};


if (startUpParams.StartApiService) {
    console.log("Starting API service");
    new ApiService(startUpParams).start(5000);
} else {
    console.log("API service is disabled");

    BotService.startAsync(startUpParams, qrReceived => console.log(qrReceived), () => { });
}
