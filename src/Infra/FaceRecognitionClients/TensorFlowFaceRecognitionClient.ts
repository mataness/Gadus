import {
    nets,
    env,
    FaceMatcher,
    LabeledFaceDescriptors,
    detectAllFaces,
    detectSingleFace,
} from '@vladmandic/face-api';
import Bottleneck from "bottleneck";
import { FaceDescriptor, IFaceDescriptorRepository } from '../../Persistency/FaceDescriptorRepository';
import { delay } from "@azure/ms-rest-js";
import * as canvas from 'canvas';
import { v4 as uuidv4 } from 'uuid';
import { FaceRecognitionClient } from './FaceRecognitionClient';



export class TensorFlowFaceRecognitionClient implements FaceRecognitionClient {
    public static async initializeOnceAsync() {
        const MODEL_URL = './models';
        const { Canvas, Image, ImageData } = canvas
        env.monkeyPatch({ Canvas, Image, ImageData } as any);
        await nets.ssdMobilenetv1.loadFromDisk(MODEL_URL);
        await nets.faceLandmark68Net.loadFromDisk(MODEL_URL);
        await nets.faceRecognitionNet.loadFromDisk(MODEL_URL);
    }

    constructor(private readonly _descriptorsRepository: IFaceDescriptorRepository) {
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

    public createGroupIfNotExistAsync(groupId : string) {
        return Promise.resolve();
    }

    public async createFaceAsync(personGroupId: string) {
        let faceId = uuidv4();
        let descriptor = JSON.stringify(new LabeledFaceDescriptors(faceId, []).toJSON());

        const newFace: FaceDescriptor = {
            faceId,
            groupId: personGroupId,
            partitionKey: "",
            rowKey: "",
            descriptor: descriptor,
        };

        await this._descriptorsRepository.addAsync(newFace);

        return newFace.faceId;
    }

    public async deleteGroupAsync(groupId: string) {
        const faces = await this._descriptorsRepository.listByGroupAsync(groupId);

        for (let face of faces) {
            await this._descriptorsRepository.deleteAsync(face.groupId, face.faceId);
        }
    }

    public async deleteFaceAsync(groupId: string, faceId: string) {
        return await this._descriptorsRepository.deleteAsync(groupId, faceId);
    }

    public async deleteAllAsync() {
        const faces = await this._descriptorsRepository.listAllAsync();

        for (let face of faces) {
            await this._descriptorsRepository.deleteAsync(face.groupId, face.faceId);
        }
    }

    private async detectInternalAsync(image: Buffer, personGroupId: string): Promise<string[]> {
        const imageLoaded = await canvas.loadImage(image);

        const detectedFaces = await detectAllFaces(imageLoaded as any)
            .withFaceLandmarks()
            .withFaceDescriptors();

        const facesDescriptors = detectedFaces.map(face => face.descriptor).filter(val => val != null);

        const groupFaceMatcher = await this.getGroupFaceMatcherAsync(personGroupId);

        const result: string[] = [];
        if (facesDescriptors.length == 0) {
            return result;
        }

        for (let i = 0; i < facesDescriptors.length; i++) {
            let match = await groupFaceMatcher.findBestMatch(facesDescriptors[i]);
            console.log("Face found with distance" + match.distance);

            if (match.distance <= groupFaceMatcher.distanceThreshold) {
                result.push(match.label);
            }
        }

        return result;
    }

    private async getGroupFaceMatcherAsync(groupId: string) {
        let faces = await this._descriptorsRepository.listByGroupAsync(groupId);

        let facesDescriptors = faces
        .map(face => LabeledFaceDescriptors.fromJSON(JSON.parse(face.descriptor)))
        .filter(d => d.descriptors.length > 0);

        return new FaceMatcher(facesDescriptors, 0.43);
    }

    private async trainInternalAsync(groupId: string, faceId: string, image: Buffer) {
        let faceDescriptor = null as unknown as FaceDescriptor;

        let img = await canvas.loadImage(image);
        let newAdditionalDescriptor = await this.processImagesForRecognition(img as any);

        if (!newAdditionalDescriptor) {
            return false;
        }

        for (let i = 0; i < 20; i++) {
            faceDescriptor = await this._descriptorsRepository.getAsync(groupId, faceId);

            if (!faceDescriptor.isTraining || (new Date().getUTCMilliseconds() - faceDescriptor.timeStamp?.getUTCMilliseconds()!) > 1000 * 90) {
                break;
            }

            await delay(5000);
        }

        faceDescriptor.isTraining = true;
        faceDescriptor.etag = await this._descriptorsRepository.updateAsync(faceDescriptor);
        faceDescriptor.isTraining = false;
        let currentFaceDescriptor = LabeledFaceDescriptors.fromJSON(JSON.parse(faceDescriptor.descriptor));

        try {
            currentFaceDescriptor.descriptors.push(newAdditionalDescriptor);
            faceDescriptor.descriptor = JSON.stringify(currentFaceDescriptor.toJSON());
            await this._descriptorsRepository.updateAsync(faceDescriptor);

            return true;
        }
        catch(error: any) {
            console.log(`Failed to train face ${faceId} in group ${groupId}: ${error}`);

            return false;
        }
    }

    private async processImagesForRecognition(image: HTMLImageElement) {
        const faceDescriptions = await detectAllFaces(image)
            .withFaceLandmarks()
            .withFaceDescriptors();


        if (faceDescriptions.length != 1) {
            return null;
        }

        let faceDescription = faceDescriptions[0];

        if (faceDescription?.descriptor == null || faceDescription.detection.score < 0.85) {
            return null;
        }

        return faceDescription.descriptor;
    }


    private readonly _trainThrottled: ((arg1: string, arg2: string, arg3: Buffer) => Promise<boolean>) & { withOptions: (options: Bottleneck.JobOptions, arg1: string, arg2: string, arg3: Buffer) => Promise<boolean>; };
    private readonly _detectionThrottled: ((arg1: Buffer, arg2: string) => Promise<string[]>) & { withOptions: (options: Bottleneck.JobOptions, arg1: Buffer, arg2: string) => Promise<string[]>; };
}
