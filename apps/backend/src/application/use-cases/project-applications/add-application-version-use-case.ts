import { Injectable } from "@nestjs/common";

import { InvalidArgumentError } from "../../../domain/entities/error/invalid-argument-error";
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { isCatalogProject } from "../../../domain/entities/project-application/catalog-project";
import { ProjectApplication } from "../../../domain/entities/project-application/project-application";
import {
    ProjectApplicationVersion,
} from "../../../domain/entities/project-application/project-application-version";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import {
    ProjectApplicationRepository,
} from "../../interfaces/repositories/project-application-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type AddApplicationVersionInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        platform: string;
        application: string;
        version: string;
        appRef?: string;
        webdriverRef?: string;
    },
};

export type AddedApplicationVersion = {
    application: ProjectApplication;
    version: ProjectApplicationVersion;
};

// Registers one build of an application: an honest FULL version plus its artifacts. A custom build
// always brings its artifact (a key in the project's delegated bucket); only the install catalog may
// register a version with nothing to deliver — a preinstalled system app.
@Injectable()
export class AddApplicationVersionUseCase {
    private readonly permissionName = UserPermissionName.Application.Create;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly projectApplicationRepository: ProjectApplicationRepository,
    ) {}

    async execute({ creds, params }: AddApplicationVersionInput): Promise<AddedApplicationVersion> {
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

        if (!isCatalogProject(project) && params.appRef === undefined) {
            throw new InvalidArgumentError(
                "a custom build requires an appRef — the artifact's object key in the project's bucket",
            );
        }

        const version = application.addVersion({
            version: params.version,
            appRef: params.appRef,
            webdriverRef: params.webdriverRef,
        });

        await this.projectApplicationRepository.save(application);

        return { application, version };
    }
}
