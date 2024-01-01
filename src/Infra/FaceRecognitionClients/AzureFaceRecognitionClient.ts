import { FaceClient } from "@azure/cognitiveservices-face";
import { TrainingStatusType } from "@azure/cognitiveservices-face/esm/models";
import { createReadStream } from "streamifier";
import { ApiKeyCredentials, delay } from "@azure/ms-rest-js";
import Bottleneck from "bottleneck";
import { FaceRecognitionClient } from "./FaceRecognitionClient";

const recognitionOptions = {
    recognitionModel: "recognition_04" as any,
    detectionModel: "detection_03" as any
};



export class AzureFaceRecognitionClient implements FaceRecognitionClient {
    constructor(azureFaceEndpoint: string, azureFaceApiKey: string) {
        const credentials = new ApiKeyCredentials({ inHeader: { 'Ocp-Apim-Subscription-Key': azureFaceApiKey } });
        this._faceClient = new FaceClient(credentials, azureFaceEndpoint);
        const limiter = new Bottleneck({
            maxConcurrent: 5,
            minTime: 1000
        });

        this._detectionThrottled = limiter.wrap(this.detectInternalAsync);
        this._trainThrottled = limiter.wrap(this.trainInternalAsync)
    }

    public async detectAsync(image: Buffer, personGroupId: string): Promise<string[]> {
        return await this._detectionThrottled(image, personGroupId);
    }

    public async trainAsync(personGroupId: string, personId: string, image: Buffer) {
        return await this._trainThrottled(personGroupId, personId, image);
    }


    private async detectInternalAsync(image: Buffer, personGroupId: string): Promise<string[]> {
        let stream = createReadStream(image);
        const faces = await this._faceClient.face.detectWithStream(() => stream, { recognitionModel: recognitionOptions.recognitionModel, detectionModel: recognitionOptions.detectionModel });
        const faceIds = faces.map(val => val.faceId).filter(val => val != null);

        const result: string[] = [];
        if (faceIds.length == 0) {
            return result;
        }

        const chunkSize = 10;

        for (let i = 0; i < faceIds.length; i += chunkSize) {
            const chunk = faceIds.slice(i, i + chunkSize) as string[];

            const detections = await this._faceClient.face.identify(chunk, { personGroupId: personGroupId, confidenceThreshold: 0.7 });

            if (detections.length == 0) {
                continue;
            }

            for (let i = 0; i < detections.length; i++) {
                if (detections[i].candidates.length == 0) {
                    continue;
                }

                for (let j = 0; j < detections[i].candidates.length; j++) {
                    console.log("Face found !");
                    result.push(detections[i].candidates[j].personId);
                }
            }
        }

        return result;
    }

    public async createGroupIfNotExistAsync(id: string) {
        try {
            const group = await this._faceClient.personGroup.get(id);

            if (group != null) {
                return;
            }
        } catch (error: any) {
            if (!error.statusCode || error.statusCode != 404) {
                console.log("Unexpected Azure Face API error: " + error.toString())
                throw error;
            }
        }

        await this._faceClient.personGroup.create(id, id, { recognitionModel: recognitionOptions.recognitionModel });
    }

    public async createFaceAsync(personGroupId: string) {
        const resp = await this._faceClient.personGroupPerson.create(personGroupId, { name: personGroupId });

        return resp.personId;
    }

    private async trainInternalAsync(personGroupId: string, personId: string, image: Buffer) : Promise<boolean> {
        let shouldCheckStatus = true;
        try {
            let trainingStatus = await this._faceClient.personGroup.getTrainingStatus(personGroupId);

            while (shouldCheckStatus) {
                if (trainingStatus.status != 'running') {
                    break;
                }

                await delay(5000);
            }

        } catch (error: any) {
            if (error.message.includes("Person group not trained")) {
                shouldCheckStatus = false;
            } else {
                console.log(`Failed to train face ${personId} in group ${personGroupId}: ${error}`);

                return false;
            }
        }

        let stream = createReadStream(image);


        await this._faceClient.personGroupPerson.addFaceFromStream(personGroupId, personId, () => stream);
        await this._faceClient.personGroup.train(personGroupId);

        return true;
    }

    public async getGroupsAsync() {
        return await this._faceClient.personGroup.list();
    }

    public async getFacesByGroupAsync(groupId: string) {
        return await this._faceClient.personGroupPerson.list(groupId);
    }

    public async deleteGroupAsync(groupId: string) {
        await this._faceClient.personGroup.deleteMethod(groupId);
    }

    public async deleteFaceAsync(groupId: string, personId: string) {
        await this._faceClient.personGroupPerson.deleteMethod(groupId, personId);
    }

    public async deleteAllAsync() {
        const groups = await this._faceClient.personGroup.list();

        for (let group of groups) {
            await this._faceClient.personGroup.deleteMethod(group.personGroupId);
        }
    }

    private readonly _trainThrottled: ((arg1: string, arg2: string, arg3: Buffer) => Promise<boolean>) & { withOptions: (options: Bottleneck.JobOptions, arg1: string, arg2: string, arg3: Buffer) => Promise<boolean>; };
    private readonly _faceClient: FaceClient;
    private readonly _detectionThrottled: ((arg1: Buffer, arg2: string) => Promise<string[]>) & { withOptions: (options: Bottleneck.JobOptions, arg1: Buffer, arg2: string) => Promise<string[]>; };
}