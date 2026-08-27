import { Injectable } from "@nestjs/common";

import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { StorageDestination } from "../../../domain/entities/storage/storage-destination";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { StorageDestinationRepository } from "../../interfaces/repositories/storage-destination-repository";
import { AccessControl } from "../../services/access-control";

type GetProjectStorageDestinationInput = {
    creds: {
        token: string;
    };
    params: {
        projectId: string;
    };
};

@Injectable()
export class GetProjectStorageDestinationUseCase {
    private readonly permissionName = UserPermissionName.StorageDestination.Get;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly storageDestinationRepository: StorageDestinationRepository,
    ) {}

    async execute({ creds, params }: GetProjectStorageDestinationInput): Promise<StorageDestination> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const projectId = ProjectId.fromString(project.id);

        const destination = await this.storageDestinationRepository.find(projectId);

        if (!destination) {
            throw new NotFoundResourceError(`projects/${params.projectId}/storageDestination`);
        }

        return destination;
    }
}
