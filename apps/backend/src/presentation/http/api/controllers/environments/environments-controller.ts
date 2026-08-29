import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";

import { clampPageSize } from "../../../../../application/pagination";
import { CreateEnvironmentUseCase } from "../../../../../application/use-cases/environments/create-environment-use-case";
import { DeleteEnvironmentUseCase } from "../../../../../application/use-cases/environments/delete-environment-use-case";
import { GetEnvironmentUseCase } from "../../../../../application/use-cases/environments/get-environment-use-case";
import { ListEnvironmentsUseCase } from "../../../../../application/use-cases/environments/list-environments-use-case";
import {
    GetEnvironmentSessionUseCase,
} from "../../../../../application/use-cases/sessions/get-environment-session-use-case";
import { BearerToken } from "../../../decorators/param/bearer-token";
import { decodePageToken, encodePageToken } from "../../../pagination/page";
import { PageRequestModel } from "../../../pagination/page-request-model";

import { CreateEnvironmentRequestModel } from "./io/create-environment-request-model";
import { EnvironmentPresenter } from "./io/environment-presenter";
import { EnvironmentSessionPresenter } from "./io/environment-session-presenter";
import { ListEnvironmentsPresenter } from "./io/list-environments-presenter";

@Controller("projects/:project/environments")
export class EnvironmentsController {
    constructor(
        private readonly createEnvironmentUseCase: CreateEnvironmentUseCase,
        private readonly getEnvironmentUseCase: GetEnvironmentUseCase,
        private readonly listEnvironmentsUseCase: ListEnvironmentsUseCase,
        private readonly deleteEnvironmentUseCase: DeleteEnvironmentUseCase,
        private readonly getEnvironmentSessionUseCase: GetEnvironmentSessionUseCase,
    ) {}

    @Post()
    async createEnvironment(
        @Param("project") project: string,
        @Body() body: CreateEnvironmentRequestModel,
        @BearerToken() token: string,
    ): Promise<EnvironmentPresenter> {
        return new EnvironmentPresenter(await this.createEnvironmentUseCase.execute({
            creds: { token },
            params: {
                projectId: project,
                environmentId: body.environmentId,
                platform: body.platform,
                execution: body.execution,
                applications: body.applications,
            },
        }), project);
    }

    @Get()
    async listEnvironments(
        @Param("project") project: string,
        @Query() query: PageRequestModel,
        @BearerToken() token: string,
    ): Promise<ListEnvironmentsPresenter> {
        const page = await this.listEnvironmentsUseCase.execute({
            creds: { token },
            params: {
                projectId: project,
                page: { limit: clampPageSize(query.pageSize), after: decodePageToken(query.pageToken) },
            },
        });

        return new ListEnvironmentsPresenter(
            page.items,
            project,
            page.nextCursor ? encodePageToken(page.nextCursor) : undefined,
        );
    }

    @Get(":environment")
    async getEnvironment(
        @Param("project") project: string,
        @Param("environment") environment: string,
        @BearerToken() token: string,
    ): Promise<EnvironmentPresenter> {
        return new EnvironmentPresenter(await this.getEnvironmentUseCase.execute({
            creds: { token },
            params: { projectId: project, environmentId: environment },
        }), project);
    }

    // Recovers the live session id for the session's creator (404 to everyone else — existence is not
    // revealed). Nothing is read from storage but ownership: the id comes live off the node.
    @Get(":environment/session")
    async getEnvironmentSession(
        @Param("project") project: string,
        @Param("environment") environment: string,
        @BearerToken() token: string,
    ): Promise<EnvironmentSessionPresenter> {
        return new EnvironmentSessionPresenter(await this.getEnvironmentSessionUseCase.execute({
            creds: { token },
            params: { projectId: project, environmentId: environment },
        }));
    }

    // AIP-135 soft delete: return the resource with its (now deleting/deleted) state, not an empty body.
    @Delete(":environment")
    async deleteEnvironment(
        @Param("project") project: string,
        @Param("environment") environment: string,
        @BearerToken() token: string,
    ): Promise<EnvironmentPresenter> {
        return new EnvironmentPresenter(await this.deleteEnvironmentUseCase.execute({
            creds: { token },
            params: { projectId: project, environmentId: environment },
        }), project);
    }
}
