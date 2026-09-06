import { Injectable } from "@nestjs/common";

import { PlatformCatalog } from "../../../domain/entities/application-catalog/platform-catalog";
import { InvalidArgumentError } from "../../../domain/entities/error/invalid-argument-error";
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { isCatalogProject } from "../../../domain/entities/project-application/catalog-project";
import {
    ApplicationConflictError,
} from "../../../domain/entities/project-application/error/application-conflict-error";
import {
    ReservedApplicationWordError,
} from "../../../domain/entities/project-application/error/reserved-application-word-error";
import { ProjectApplication } from "../../../domain/entities/project-application/project-application";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import {
    ProjectApplicationRepository,
} from "../../interfaces/repositories/project-application-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";
import { ApplicationCatalogLoader } from "../../services/application-catalog-loader";

type CreateProjectApplicationInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        platform: string;
        name: string;
        aliases?: Array<string>;
    },
};

// Registers an application in a project. In the reserved catalog project this is how install admins
// grow the provided set (a canonical id plus wire aliases — declared by the install, the one trusted
// source). In a user project it registers a custom under ONE word of the user's choosing — an
// addressing handle, not an identity claim: the honest identity (an APK's package id and version) is
// MEASURED at delivery, not declared. Never a word the install catalog answers to (the docker rule:
// catalog words mean the same thing in every project).
@Injectable()
export class CreateProjectApplicationUseCase {
    private readonly permissionName = UserPermissionName.Application.Create;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly projectApplicationRepository: ProjectApplicationRepository,
        private readonly applicationCatalogLoader: ApplicationCatalogLoader,
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
            name: params.name,
            aliases: params.aliases,
        });

        if (!isCatalogProject(project) && application.aliases.length > 0) {
            throw new InvalidArgumentError(
                "aliases are install-catalog vocabulary — a custom application IS its registered word",
            );
        }

        if (await this.projectApplicationRepository.find(projectId, params.platform, params.name)) {
            throw new ApplicationConflictError(params.platform, params.name);
        }

        const catalog = await this.applicationCatalogLoader.loadFor(projectId);

        for (const word of application.words()) {
            if (catalog.catalogReserves(params.platform, word)) {
                throw new ReservedApplicationWordError(params.platform, word);
            }
        }

        await this.projectApplicationRepository.save(application);

        return application;
    }
}
