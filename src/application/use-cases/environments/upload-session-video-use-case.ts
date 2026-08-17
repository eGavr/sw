import { Readable } from "node:stream";

import { Injectable } from "@nestjs/common";

import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { SessionVideoKey } from "../../../domain/entities/storage/session-video-key";
import { ObjectStorageGateway } from "../../interfaces/gateways/object-storage-gateway";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { StorageDestinationRepository } from "../../interfaces/repositories/storage-destination-repository";

export type UploadSessionVideoParams = {
    readonly environmentId: string;
    readonly body: Readable;
    readonly contentType?: string;
};

export type UploadSessionVideoResult = {
    readonly environmentId: string;
    readonly stored: boolean;
};

// Internal scenario: the in-pod agent ships a finished session's video recording. The upload is delegated
// to our own identity here in the control-plane (the agent never gets cloud credentials). The body is a
// stream piped straight to storage, so an arbitrarily large recording is never buffered in memory. If the
// project has not configured a storage destination we quietly no-op (`stored: false`) so the agent drops
// the video.
@Injectable()
export class UploadSessionVideoUseCase {
    constructor(
        private readonly environmentRepository: EnvironmentRepository,
        private readonly storageDestinationRepository: StorageDestinationRepository,
        private readonly objectStorageGateway: ObjectStorageGateway,
    ) {}

    async execute(params: UploadSessionVideoParams): Promise<UploadSessionVideoResult> {
        const environment = await this.environmentRepository.get(EnvironmentId.fromString(params.environmentId));
        const destination = await this.storageDestinationRepository.find(environment.projectId);

        if (!destination) {
            return { environmentId: environment.id, stored: false };
        }

        const key = destination.keyFor(SessionVideoKey.forEnvironment(environment.id, new Date()));
        await this.objectStorageGateway.putStream(destination, key, { body: params.body, contentType: params.contentType });

        return { environmentId: environment.id, stored: true };
    }
}
