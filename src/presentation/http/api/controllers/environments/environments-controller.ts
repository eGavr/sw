import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";

import { clampPageSize } from "../../../../../application/pagination";
import { CreateEnvironmentUseCase } from "../../../../../application/use-cases/environments/create-environment-use-case";
import { DeleteEnvironmentUseCase } from "../../../../../application/use-cases/environments/delete-environment-use-case";
import { GetEnvironmentUseCase } from "../../../../../application/use-cases/environments/get-environment-use-case";
import { ListEnvironmentsUseCase } from "../../../../../application/use-cases/environments/list-environments-use-case";
import { BearerToken } from "../../../decorators/param/bearer-token";
import { decodePageToken, encodePageToken } from "../../../pagination/page";
import { PageRequestModel } from "../../../pagination/page-request-model";

import { CreateEnvironmentRequestModel } from "./io/create-environment-request-model";
import { EnvironmentPresenter } from "./io/environment-presenter";
import { ListEnvironmentsPresenter } from "./io/list-environments-presenter";

@Controller("projects/:project/environments")
export class EnvironmentsController {
    constructor(
        private readonly createEnvironmentUseCase: CreateEnvironmentUseCase,
        private readonly getEnvironmentUseCase: GetEnvironmentUseCase,
        private readonly listEnvironmentsUseCase: ListEnvironmentsUseCase,
        private readonly deleteEnvironmentUseCase: DeleteEnvironmentUseCase,
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
