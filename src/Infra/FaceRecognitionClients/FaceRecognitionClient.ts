export interface FaceRecognitionClient {
    trainAsync(groupId: string, faceId: string, image: Buffer) : Promise<boolean>;
    createFaceAsync(groupId: string) : Promise<string>;
    createGroupIfNotExistAsync(groupId: string) : Promise<void>;
    detectAsync(image: Buffer, groupId: string): Promise<string[]>;
    deleteGroupAsync(groupId: string) : Promise<void>;
    deleteAllAsync() : Promise<void>;
    deleteFaceAsync(groupId: string, faceId: string) : Promise<void>;
}