import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";

import {
    AddApplicationVersionUseCase,
} from "../../../../../application/use-cases/project-applications/add-application-version-use-case";
import {
    CreateProjectApplicationUseCase,
} from "../../../../../application/use-cases/project-applications/create-project-application-use-case";
import {
    DeleteProjectApplicationUseCase,
} from "../../../../../application/use-cases/project-applications/delete-project-application-use-case";
import {
    GetProjectApplicationUseCase,
} from "../../../../../application/use-cases/project-applications/get-project-application-use-case";
import {
    ListProjectApplicationsUseCase,
} from "../../../../../application/use-cases/project-applications/list-project-applications-use-case";
import { catalogProjectHandle } from "../../../../../domain/entities/project-application/catalog-project";
import { BearerToken } from "../../../decorators/param/bearer-token";

import {
    AddApplicationVersionRequestModel,
} from "./io/add-application-version-request-model";
import {
    ApplicationVersionPresenter,
    ListApplicationVersionsPresenter,
} from "./io/application-version-presenter";
import {
    CreateProjectApplicationRequestModel,
} from "./io/create-project-application-request-model";
import {
    ListProjectApplicationsPresenter,
    ProjectApplicationPresenter,
} from "./io/project-application-presenter";

// A project's registered applications — its deliverable builds. One surface for both worlds (the GCE
// vendor-project model): in the reserved `catalog` project these are the install's provided set,
// managed by install admins with the same handlers; in a user project, its customs. Whether artifact
// refs are echoed follows the owner: a custom's refs are the project's own bucket keys, the catalog's
// are the install's internals and stay private.
@Controller("projects/:project/platforms/:platform/applications")
export class ProjectApplicationsController {
    constructor(
        private readonly createProjectApplicationUseCase: CreateProjectApplicationUseCase,
        private readonly addApplicationVersionUseCase: AddApplicationVersionUseCase,
        private readonly listProjectApplicationsUseCase: ListProjectApplicationsUseCase,
        private readonly getProjectApplicationUseCase: GetProjectApplicationUseCase,
        private readonly deleteProjectApplicationUseCase: DeleteProjectApplicationUseCase,
    ) {}

    @Post()
    async createApplication(
        @BearerToken() token: string,
        @Param("project") project: string,
        @Param("platform") platform: string,
        @Body() body: CreateProjectApplicationRequestModel,
    ): Promise<ProjectApplicationPresenter> {
        const application = await this.createProjectApplicationUseCase.execute({
            creds: { token },
            params: { projectId: project, platform, name: body.name, aliases: body.aliases },
        });

        return new ProjectApplicationPresenter(project, application);
    }

    @Get()
    async listApplications(
        @BearerToken() token: string,
        @Param("project") project: string,
        @Param("platform") platform: string,
    ): Promise<ListProjectApplicationsPresenter> {
        const applications = await this.listProjectApplicationsUseCase.execute({
            creds: { token },
            params: { projectId: project, platform },
        });

        return new ListProjectApplicationsPresenter(project, applications);
    }

    @Get(":application")
    async getApplication(
        @BearerToken() token: string,
        @Param("project") project: string,
        @Param("platform") platform: string,
        @Param("application") application: string,
    ): Promise<ProjectApplicationPresenter> {
        const found = await this.getProjectApplicationUseCase.execute({
            creds: { token },
            params: { projectId: project, platform, application },
        });

        return new ProjectApplicationPresenter(project, found);
    }

    @Delete(":application")
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteApplication(
        @BearerToken() token: string,
        @Param("project") project: string,
        @Param("platform") platform: string,
        @Param("application") application: string,
    ): Promise<void> {
        await this.deleteProjectApplicationUseCase.execute({
            creds: { token },
            params: { projectId: project, platform, application },
        });
    }

    @Post(":application/versions")
    async addVersion(
        @BearerToken() token: string,
        @Param("project") project: string,
        @Param("platform") platform: string,
        @Param("application") applicationName: string,
        @Body() body: AddApplicationVersionRequestModel,
    ): Promise<ApplicationVersionPresenter> {
        const { application, version } = await this.addApplicationVersionUseCase.execute({
            creds: { token },
            params: {
                projectId: project,
                platform,
                application: applicationName,
                version: body.version,
                appRef: body.appRef,
                webdriverRef: body.webdriverRef,
            },
        });

        return new ApplicationVersionPresenter(project, application, version, this.exposesRefs(project));
    }

    @Get(":application/versions")
    async listVersions(
        @BearerToken() token: string,
        @Param("project") project: string,
        @Param("platform") platform: string,
        @Param("application") application: string,
    ): Promise<ListApplicationVersionsPresenter> {
        const found = await this.getProjectApplicationUseCase.execute({
            creds: { token },
            params: { projectId: project, platform, application },
        });

        return new ListApplicationVersionsPresenter(project, found, this.exposesRefs(project));
    }

    // Refs are the owner's data for a custom project; the catalog project's are the install's
    // internals. The handle decides the shape — the reserved handle IS the identity (a rename-proof
    // uid lookup would need the project row this transport concern does not warrant).
    private exposesRefs(projectHandle: string): boolean {
        return projectHandle !== catalogProjectHandle;
    }
}
