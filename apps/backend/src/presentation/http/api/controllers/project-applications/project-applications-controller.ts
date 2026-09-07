import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";

import { clampPageSize, PageCursor, PageRequest } from "../../../../../application/pagination";
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
    ListApplicationVersionsUseCase,
} from "../../../../../application/use-cases/project-applications/list-application-versions-use-case";
import {
    ListProjectApplicationsUseCase,
} from "../../../../../application/use-cases/project-applications/list-project-applications-use-case";
import { catalogProjectHandle } from "../../../../../domain/entities/project-application/catalog-project";
import { BearerToken } from "../../../decorators/param/bearer-token";
import { decodePageToken, encodePageToken } from "../../../pagination/page";
import { PageRequestModel } from "../../../pagination/page-request-model";

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
        private readonly listApplicationVersionsUseCase: ListApplicationVersionsUseCase,
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
            params: { projectId: project, platform, nameAlias: body.nameAlias },
        });

        return new ProjectApplicationPresenter(project, application);
    }

    @Get()
    async listApplications(
        @BearerToken() token: string,
        @Param("project") project: string,
        @Param("platform") platform: string,
        @Query() query: PageRequestModel,
    ): Promise<ListProjectApplicationsPresenter> {
        const page = await this.listProjectApplicationsUseCase.execute({
            creds: { token },
            params: { projectId: project, platform, page: this.pageRequest(query) },
        });

        return new ListProjectApplicationsPresenter(project, page.items, this.nextPageToken(page.nextCursor));
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
                versionAlias: body.versionAlias,
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
        @Query() query: PageRequestModel,
    ): Promise<ListApplicationVersionsPresenter> {
        const found = await this.getProjectApplicationUseCase.execute({
            creds: { token },
            params: { projectId: project, platform, application },
        });
        const page = await this.listApplicationVersionsUseCase.execute({
            creds: { token },
            params: { projectId: project, platform, application, page: this.pageRequest(query) },
        });

        return new ListApplicationVersionsPresenter(
            project,
            found,
            page.items,
            this.exposesRefs(project),
            this.nextPageToken(page.nextCursor),
        );
    }

    private pageRequest(query: PageRequestModel): PageRequest {
        return { limit: clampPageSize(query.pageSize), after: decodePageToken(query.pageToken) };
    }

    private nextPageToken(cursor: PageCursor | undefined): string | undefined {
        return cursor ? encodePageToken(cursor) : undefined;
    }

    // Refs are the owner's data for a custom project; the catalog project's are the install's
    // internals. The handle decides the shape — the reserved handle IS the identity (a rename-proof
    // uid lookup would need the project row this transport concern does not warrant).
    private exposesRefs(projectHandle: string): boolean {
        return projectHandle !== catalogProjectHandle;
    }
}
