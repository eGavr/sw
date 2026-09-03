import { Injectable } from "@nestjs/common";

import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { OwnershipMarker } from "../../../domain/entities/verification/ownership-marker";
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
// next session's upload. Deliberately NOT under the `sw-verify/` prefix, so no write path our identity
// performs can ever forge an ownership marker.
const probeKey = ".sw-connectivity-check";

// Verifies the configured storage destination is usable: (1) we can actually write under our delegated
// identity (write-probe), and (2) the bucket carries THIS project's ownership marker object — proof the
// bucket's owner authorised this project (naming someone else's bucket fails here: it has no marker for
// this project and only its owner could place one). Never throws on a storage failure — a broken or
// unverified destination is the expected answer, returned as `{ ok: false, message }`.
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

        const projectId = ProjectId.fromString(project.id);
        const destination = await this.storageDestinationRepository.find(projectId);

        if (!destination) {
            throw new NotFoundResourceError(`projects/${params.projectId}/storageDestination`);
        }

        const marker = OwnershipMarker.forProject(project.id);

        try {
            await this.objectStorageGateway.put(
                destination,
                destination.keyFor(probeKey),
                { body: Buffer.from("sw"), contentType: "text/plain" },
            );

            // Ownership marker lives at the bucket root (prefix-independent) — read, never written by us.
            const owned = await this.objectStorageGateway.get(destination, marker.objectKey());

            if (!owned) {
                return { ok: false, message: `bucket is missing the ownership object ${marker.objectKey()}` };
            }

            return { ok: true };
        } catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
    }
}
