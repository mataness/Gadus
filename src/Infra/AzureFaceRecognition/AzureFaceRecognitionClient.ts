import { FaceClient } from "@azure/cognitiveservices-face";
import { TrainingStatusType } from "@azure/cognitiveservices-face/esm/models";
import { ApiKeyCredentials, delay } from "@azure/ms-rest-js";
import Bottleneck from "bottleneck";

const recognitionOptions = {
    recognitionModel: "recognition_04" as any,
    detectionModel: "detection_03" as any
};



export class AzureFaceRecognitionClient {
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

    public async detectAsync(image: NodeJS.ReadableStream, personGroupId: string): Promise<string[]> {
        return await this._detectionThrottled(image, personGroupId);
    }

    public async trainAsync(personGroupId: string, personId: string, image: NodeJS.ReadableStream) {
        await this._trainThrottled(personGroupId, personId, image);
    }


    private async detectInternalAsync(image: NodeJS.ReadableStream, personGroupId: string): Promise<string[]> {
        const faces = await this._faceClient.face.detectWithStream(() => image, { recognitionModel: recognitionOptions.recognitionModel, detectionModel: recognitionOptions.detectionModel });
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

    public async createPersonGroupIfNotExistAsync(id: string) {
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

    public async createPersonInPersonGroupAsync(personGroupId: string) {
        const resp = await this._faceClient.personGroupPerson.create(personGroupId, { name: personGroupId });

        return resp.personId;
    }

    private async trainInternalAsync(personGroupId: string, personId: string, image: NodeJS.ReadableStream) {
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
                throw error;
            }
        }



        await this._faceClient.personGroupPerson.addFaceFromStream(personGroupId, personId, () => image);
        await this._faceClient.personGroup.train(personGroupId);
    }

    public async getGroupAsync(groupId: string) {
        return await this._faceClient.personGroup.get(groupId);
    }

    public async getGroupsAsync() {
        return await this._faceClient.personGroup.list();
    }

    public async getFacesByGroupAsync(groupId: string) {
        return await this._faceClient.personGroupPerson.list(groupId);
    }

    public async deleteGroupAsync(groupId: string) {
        return await this._faceClient.personGroup.deleteMethod(groupId);
    }

    public async deleteFaceAsync(groupId: string, personId: string) {
        return await this._faceClient.personGroupPerson.deleteMethod(groupId, personId);
    }

    public async deleteAllAsync() {
        const groups = await this._faceClient.personGroup.list();

        for (let group of groups) {
            await this._faceClient.personGroup.deleteMethod(group.personGroupId);
        }
    }

    private readonly _trainThrottled: ((arg1: string, arg2: string, arg3: NodeJS.ReadableStream) => Promise<void>) & { withOptions: (options: Bottleneck.JobOptions, arg1: string, arg2: string, arg3: NodeJS.ReadableStream) => Promise<void>; };
    private readonly _faceClient: FaceClient;
    private readonly _detectionThrottled: ((arg1: NodeJS.ReadableStream, arg2: string) => Promise<string[]>) & { withOptions: (options: Bottleneck.JobOptions, arg1: NodeJS.ReadableStream, arg2: string) => Promise<string[]>; };
}


/*const detector = new AzureFaceRecognitionClient();
const h = StringUtils.hash("120363026260855167@g.us");
console.log(h);
detector.getGroupsAsync().then(groups => {
    console.log(groups);
})
*/