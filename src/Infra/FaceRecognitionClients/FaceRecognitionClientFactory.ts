import { deserializationPolicy } from "@azure/storage-blob";
import { IFaceDescriptorRepository } from "../../Persistency/FaceDescriptorRepository";
import { AzureFaceRecognitionClient } from "./AzureFaceRecognitionClient";
import { TensorFlowFaceRecognitionClient } from "./TensorFlowFaceRecognitionClient";

export interface FaceRecognitionClientOptions {
    azureFaceApiEndpoint? : string;
    azureFaceApiKey? : string;
}
export const createCreateFaceRecognitionClientAsync = async (faceDescriptorRepo : IFaceDescriptorRepository, options : FaceRecognitionClientOptions) => {
    if(options.azureFaceApiEndpoint) {
        console.log("Creating Azure Face recongition client");

        return new AzureFaceRecognitionClient(options.azureFaceApiEndpoint, options.azureFaceApiKey!);
    }

    console.log("Creating TensorFlow recongition client");

    await TensorFlowFaceRecognitionClient.initializeOnceAsync();

    return new TensorFlowFaceRecognitionClient(faceDescriptorRepo);
}