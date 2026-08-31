import { Injectable } from "@nestjs/common";

import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { ObjectStorageGateway } from "../../interfaces/gateways/object-storage-gateway";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { StorageDestinationRepository } from "../../interfaces/repositories/storage-destination-repository";
import { AccessControl } from "../../services/access-control";

type TestProjectStorageDestinationInput = {
    creds: {
        token: string;
    };
    params: {
        projectId: string;
    };
};

export type StorageDestinationProbe = {
    readonly ok: boolean;
    readonly message?: string;
};

// The key of the tiny marker the probe writes to prove real write access under our delegated identity —
// a bucket that does not exist or a policy that does not grant us access fails here, not silently at the
// next session's upload.
const probeKey = ".sw-connectivity-check";

// Verifies the configured storage destination actually works: writes a tiny marker under our identity
// and reports success or the backend's error. Never throws on a storage failure — a broken destination
// is the expected answer, returned as `{ ok: false, message }`. The S3 client is bounded (fast connect
// timeout, few retries), so a wrong endpoint fails in seconds, not minutes.
@Injectable()
export class TestProjectStorageDestinationUseCase {
    private readonly permissionName = UserPermissionName.StorageDestination.Set;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly storageDestinationRepository: StorageDestinationRepository,
        private readonly objectStorageGateway: ObjectStorageGateway,
    ) {}

    async execute({ creds, params }: TestProjectStorageDestinationInput): Promise<StorageDestinationProbe> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const destination = await this.storageDestinationRepository.find(ProjectId.fromString(project.id));

        if (!destination) {
            throw new NotFoundResourceError(`projects/${params.projectId}/storageDestination`);
        }

        try {
            await this.objectStorageGateway.put(
                destination,
                destination.keyFor(probeKey),
                { body: Buffer.from("sw"), contentType: "text/plain" },
            );

            return { ok: true };
        } catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
    }
}
