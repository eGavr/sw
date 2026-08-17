import { Injectable } from "@nestjs/common";

import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { SessionLogKey } from "../../../domain/entities/storage/session-log-key";
import { ObjectStorageGateway } from "../../interfaces/gateways/object-storage-gateway";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { StorageDestinationRepository } from "../../interfaces/repositories/storage-destination-repository";

export type UploadSessionLogsParams = {
    readonly environmentId: string;
    readonly body: Buffer;
    readonly contentType?: string;
};

export type UploadSessionLogsResult = {
    readonly environmentId: string;
    readonly stored: boolean;
};

// Internal scenario: the in-pod agent ships a finished session's logs. The upload is delegated to our
// own identity here in the control-plane (the agent never gets cloud credentials). If the project has
// not configured a storage destination we quietly no-op (`stored: false`) so the agent drops the logs.
@Injectable()
export class UploadSessionLogsUseCase {
    constructor(
        private readonly environmentRepository: EnvironmentRepository,
        private readonly storageDestinationRepository: StorageDestinationRepository,
        private readonly objectStorageGateway: ObjectStorageGateway,
    ) {}

    async execute(params: UploadSessionLogsParams): Promise<UploadSessionLogsResult> {
        const environment = await this.environmentRepository.get(EnvironmentId.fromString(params.environmentId));
        const destination = await this.storageDestinationRepository.find(environment.projectId);

        if (!destination) {
            return { environmentId: environment.id, stored: false };
        }

        const key = destination.keyFor(SessionLogKey.forEnvironment(environment.id, new Date()));
        await this.objectStorageGateway.put(destination, key, { body: params.body, contentType: params.contentType });

        return { environmentId: environment.id, stored: true };
    }
}
