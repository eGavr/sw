import { Injectable } from "@nestjs/common";

import { ProjectId } from "../../../domain/entities/project/project-id";
import { StorageDestination } from "../../../domain/entities/storage/storage-destination";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { StorageDestinationRepository } from "../../interfaces/repositories/storage-destination-repository";
import { AccessControl } from "../../services/access-control";

type SetProjectStorageDestinationInput = {
    creds: {
        token: string;
    };
    params: {
        projectId: string;
        bucket: string;
        prefix?: string;
        endpoint?: string;
        region?: string;
    };
};

@Injectable()
export class SetProjectStorageDestinationUseCase {
    private readonly permissionName = UserPermissionName.StorageDestination.Set;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly storageDestinationRepository: StorageDestinationRepository,
    ) {}

    async execute({ creds, params }: SetProjectStorageDestinationInput): Promise<StorageDestination> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const projectId = ProjectId.fromString(project.id);

        const destination = StorageDestination.create({
            bucket: params.bucket,
            prefix: params.prefix,
            endpoint: params.endpoint,
            region: params.region,
        });
        await this.storageDestinationRepository.save(projectId, destination);

        return destination;
    }
}
