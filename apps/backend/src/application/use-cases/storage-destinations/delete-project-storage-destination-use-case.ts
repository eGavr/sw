import { Injectable } from "@nestjs/common";

import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { StorageDestinationRepository } from "../../interfaces/repositories/storage-destination-repository";
import { AccessControl } from "../../services/access-control";

type DeleteProjectStorageDestinationInput = {
    creds: {
        token: string;
    };
    params: {
        projectId: string;
    };
};

// Clears the project's storage destination — back to unconfigured, so nothing is written until one is
// set again. A mutation, so it takes the same `set` permission. Idempotent (deleting an absent one is
// a no-op).
@Injectable()
export class DeleteProjectStorageDestinationUseCase {
    private readonly permissionName = UserPermissionName.StorageDestination.Set;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly storageDestinationRepository: StorageDestinationRepository,
    ) {}

    async execute({ creds, params }: DeleteProjectStorageDestinationInput): Promise<void> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        await this.storageDestinationRepository.delete(ProjectId.fromString(project.id));
    }
}
