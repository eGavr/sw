import type { Readable } from "stream";

import { Injectable } from "@nestjs/common";

import { ApplicationSource } from "../../../domain/entities/environment/application/application-source";
import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { InvalidArgumentError } from "../../../domain/entities/error/invalid-argument-error";
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { ObjectStorageGateway } from "../../interfaces/gateways/object-storage-gateway";
import { RemoteArtifactGateway } from "../../interfaces/gateways/remote-artifact-gateway";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { StorageDestinationRepository } from "../../interfaces/repositories/storage-destination-repository";

type GetApplicationArtifactParams = {
    readonly environmentId: string;
    readonly applicationName: string;
    readonly kind: "app" | "webdriver";
};

export type ApplicationArtifact = {
    readonly body: Readable;
    readonly contentType?: string;
};

// Internal scenario: the slot pulls one delivered application's artifact through the control plane —
// the slot holds no storage credentials, the CP holds them all. The environment's snapshotted refs say
// where the build lives: a URL goes to the remote store (the install's own supply), an object key to
// the PROJECT's delegated bucket (a custom build the owner registered).
@Injectable()
export class GetApplicationArtifactUseCase {
    constructor(
        private readonly environmentRepository: EnvironmentRepository,
        private readonly storageDestinationRepository: StorageDestinationRepository,
        private readonly objectStorageGateway: ObjectStorageGateway,
        private readonly remoteArtifactGateway: RemoteArtifactGateway,
    ) {}

    async execute(params: GetApplicationArtifactParams): Promise<ApplicationArtifact> {
        const environment = await this.environmentRepository.get(EnvironmentId.fromString(params.environmentId));
        const application = environment.applicationFor(params.applicationName);

        if (!application) {
            throw new NotFoundResourceError(params.applicationName);
        }

        const ref = params.kind === "app" ? application.source.appRef : application.source.webdriverRef;

        if (ref === null) {
            throw new NotFoundResourceError(`${params.applicationName}:${params.kind}`);
        }

        if (ApplicationSource.refKind(ref) === "url") {
            const artifact = await this.remoteArtifactGateway.fetch(ref);

            if (!artifact) {
                throw new NotFoundResourceError(ref);
            }

            return artifact;
        }

        return this.fromProjectBucket(environment.projectId, ref);
    }

    private async fromProjectBucket(projectId: ProjectId, key: string): Promise<ApplicationArtifact> {
        const destination = await this.storageDestinationRepository.find(projectId);

        if (!destination) {
            throw new InvalidArgumentError(
                "custom artifacts live in the project's bucket — configure a storage destination first",
            );
        }

        const stored = await this.objectStorageGateway.getStream(destination, destination.keyFor(key));

        if (!stored) {
            throw new NotFoundResourceError(key);
        }

        return { body: stored.body, contentType: stored.contentType };
    }
}
