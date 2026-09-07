import { Injectable } from "@nestjs/common";

import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { isCatalogProject } from "../../../domain/entities/project-application/catalog-project";
import {
    ProjectApplicationVersion,
} from "../../../domain/entities/project-application/project-application-version";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import {
    ProjectApplicationRepository,
} from "../../interfaces/repositories/project-application-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { Page, PageRequest } from "../../pagination";
import { AccessControl } from "../../services/access-control";

type ListApplicationVersionsInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        platform: string;
        application: string;
        page: PageRequest;
    },
};

// The builds registered under one application, a page at a time. The catalog project's are public
// like the applications themselves (see ListProjectApplicationsUseCase).
@Injectable()
export class ListApplicationVersionsUseCase {
    private readonly permissionName = UserPermissionName.Application.Get;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly projectApplicationRepository: ProjectApplicationRepository,
    ) {}

    async execute({ creds, params }: ListApplicationVersionsInput): Promise<Page<ProjectApplicationVersion>> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        if (!isCatalogProject(project)) {
            await this.accessControl.authorize(user, project, this.permissionName);
        }

        const application = await this.projectApplicationRepository.findByHandle(
            ProjectId.fromString(project.id),
            params.platform,
            params.application,
        );

        if (!application) {
            throw new NotFoundResourceError(`${params.platform}/${params.application}`);
        }

        return this.projectApplicationRepository.listVersions(application, params.page);
    }
}
