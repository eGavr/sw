import { Injectable } from "@nestjs/common";

import { PlatformCatalog } from "../../../domain/entities/application-catalog/platform-catalog";
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import {
    ApplicationConflictError,
} from "../../../domain/entities/project-application/error/application-conflict-error";
import { ProjectApplication } from "../../../domain/entities/project-application/project-application";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import {
    ProjectApplicationRepository,
} from "../../interfaces/repositories/project-application-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type CreateProjectApplicationInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        platform: string;
        nameAlias: string;
    },
};

// Registers an application in a project under ONE word — the same shape whoever the project is. In
// the reserved catalog project this is how install admins grow the provided set; in a user project it
// registers a custom, which may take a catalog word too: the catalog is the default, the project's own
// word overrides it. The word is an addressing handle, not an identity claim: the honest identity (an
// APK's package id and version) is DETECTED at delivery, not declared.
@Injectable()
export class CreateProjectApplicationUseCase {
    private readonly permissionName = UserPermissionName.Application.Create;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly projectApplicationRepository: ProjectApplicationRepository,
        private readonly platformCatalog: PlatformCatalog,
    ) {}

    async execute({ creds, params }: CreateProjectApplicationInput): Promise<ProjectApplication> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        if (!this.platformCatalog.has(params.platform)) {
            throw new NotFoundResourceError(params.platform);
        }

        const projectId = ProjectId.fromString(project.id);
        const application = ProjectApplication.create({
            projectId: project.id,
            platformName: params.platform,
            nameAlias: params.nameAlias,
        });

        if (await this.projectApplicationRepository.findByHandle(projectId, params.platform, application.nameAlias)) {
            throw new ApplicationConflictError(params.platform, application.nameAlias);
        }

        await this.projectApplicationRepository.save(application);

        return application;
    }
}
