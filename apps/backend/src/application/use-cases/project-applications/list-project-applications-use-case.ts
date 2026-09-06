import { Injectable } from "@nestjs/common";

import { PlatformCatalog } from "../../../domain/entities/application-catalog/platform-catalog";
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

type ListProjectApplicationsInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        platform: string;
    },
};

// The applications registered in a project for one platform. The reserved catalog project is the one
// deliberate exception to member-only visibility: its applications ARE the install's provided set —
// what every new-environment form renders — so any authenticated caller may read them.
@Injectable()
export class ListProjectApplicationsUseCase {
    private readonly permissionName = UserPermissionName.Application.List;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly projectApplicationRepository: ProjectApplicationRepository,
        private readonly platformCatalog: PlatformCatalog,
    ) {}

    async execute({ creds, params }: ListProjectApplicationsInput): Promise<Array<ProjectApplication>> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        if (!isCatalogProject(project)) {
            await this.accessControl.authorize(user, project, this.permissionName);
        }

        if (!this.platformCatalog.has(params.platform)) {
            throw new NotFoundResourceError(params.platform);
        }

        return this.projectApplicationRepository.list(ProjectId.fromString(project.id), params.platform);
    }
}
