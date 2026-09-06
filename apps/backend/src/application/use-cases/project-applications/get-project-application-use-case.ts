import { Injectable } from "@nestjs/common";

import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { isCatalogProject } from "../../../domain/entities/project-application/catalog-project";
import { ProjectApplication } from "../../../domain/entities/project-application/project-application";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import {
    ProjectApplicationRepository,
} from "../../interfaces/repositories/project-application-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type GetProjectApplicationInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        platform: string;
        application: string;
    },
};

@Injectable()
export class GetProjectApplicationUseCase {
    private readonly permissionName = UserPermissionName.Application.Get;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly projectApplicationRepository: ProjectApplicationRepository,
    ) {}

    async execute({ creds, params }: GetProjectApplicationInput): Promise<ProjectApplication> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        // The catalog project's applications are the install's public provided set (see List).
        if (!isCatalogProject(project)) {
            await this.accessControl.authorize(user, project, this.permissionName);
        }

        const application = await this.projectApplicationRepository.find(
            ProjectId.fromString(project.id),
            params.platform,
            params.application,
        );

        if (!application) {
            throw new NotFoundResourceError(`${params.platform}/${params.application}`);
        }

        return application;
    }
}
