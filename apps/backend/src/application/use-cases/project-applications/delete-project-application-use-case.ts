import { Injectable } from "@nestjs/common";

import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import {
    ProjectApplicationRepository,
} from "../../interfaces/repositories/project-application-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type DeleteProjectApplicationInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        platform: string;
        application: string;
    },
};

// Unregisters an application with all its builds. Environments that installed it are untouched: they
// snapshotted the artifact refs at creation and stay self-contained by design.
@Injectable()
export class DeleteProjectApplicationUseCase {
    private readonly permissionName = UserPermissionName.Application.Delete;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly projectApplicationRepository: ProjectApplicationRepository,
    ) {}

    async execute({ creds, params }: DeleteProjectApplicationInput): Promise<void> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const application = await this.projectApplicationRepository.find(
            ProjectId.fromString(project.id),
            params.platform,
            params.application,
        );

        if (!application) {
            throw new NotFoundResourceError(`${params.platform}/${params.application}`);
        }

        await this.projectApplicationRepository.delete(application);
    }
}
