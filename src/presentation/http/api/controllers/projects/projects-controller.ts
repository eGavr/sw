import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";

import { clampPageSize } from "../../../../../application/pagination";
import { CreateProjectUseCase } from "../../../../../application/use-cases/projects/create-project-use-case";
import {
    GetProjectIamPolicyUseCase,
} from "../../../../../application/use-cases/projects/get-project-iam-policy-use-case";
import { GetProjectUseCase } from "../../../../../application/use-cases/projects/get-project-use-case";
import { ListProjectsUseCase } from "../../../../../application/use-cases/projects/list-projects-use-case";
import {
    SetProjectIamPolicyUseCase,
} from "../../../../../application/use-cases/projects/set-project-iam-policy-use-case";
import { TestProjectPermissionsUseCase } from "../../../../../application/use-cases/projects/test-project-permissions-use-case";
import { ClassValidatorError } from "../../../../../domain/utils/class-validator/class-validator-error";
import { BearerToken } from "../../../decorators/param/bearer-token";
import { decodePageToken, encodePageToken } from "../../../pagination/page";
import { PageRequestModel } from "../../../pagination/page-request-model";
import { Presenter } from "../../../presenters/presenter";

import { CreateProjectRequestModel } from "./io/create-project-request-model";
import { IamPolicyPresenter } from "./io/iam-policy-presenter";
import { ListProjectsPresenter } from "./io/list-projects-presenter";
import { ProjectPresenter } from "./io/project-presenter";
import { SetIamPolicyRequestModel } from "./io/set-iam-policy-request-model";
import { TestIamPermissionsPresenter } from "./io/test-iam-permissions-presenter";
import { TestIamPermissionsRequestModel } from "./io/test-iam-permissions-request-model";

@Controller("projects")
export class ProjectsController {
    constructor(
        private readonly createProjectUseCase: CreateProjectUseCase,
        private readonly getProjectUseCase: GetProjectUseCase,
        private readonly listProjectsUseCase: ListProjectsUseCase,
        private readonly testProjectPermissionsUseCase: TestProjectPermissionsUseCase,
        private readonly getProjectIamPolicyUseCase: GetProjectIamPolicyUseCase,
        private readonly setProjectIamPolicyUseCase: SetProjectIamPolicyUseCase,
    ) {}

    @Post()
    async createProject(@Body() body: CreateProjectRequestModel, @BearerToken() token: string): Promise<ProjectPresenter> {
        return new ProjectPresenter(await this.createProjectUseCase.execute({
            creds: { token },
            params: { name: body.displayName, compute: body.compute },
        }));
    }

    @Get()
    async listProjects(@Query() query: PageRequestModel, @BearerToken() token: string): Promise<ListProjectsPresenter> {
        const page = await this.listProjectsUseCase.execute({
            creds: { token },
            params: { page: { limit: clampPageSize(query.pageSize), after: decodePageToken(query.pageToken) } },
        });

        return new ListProjectsPresenter(page.items, page.nextCursor ? encodePageToken(page.nextCursor) : undefined);
    }

    @Get(":project")
    async getProject(@Param("project") project: string, @BearerToken() token: string): Promise<ProjectPresenter> {
        return new ProjectPresenter(await this.getProjectUseCase.execute({ creds: { token }, params: { projectId: project } }));
    }

    // Custom methods (AIP-136 / google.iam.v1): POST /v1/projects/{project}:{verb}. express matches
    // "{project}:{verb}" as one path segment, so the verb is split off the last ":" and dispatched
    // here rather than routed as its own path. The body differs per verb, so it is validated per verb
    // instead of by a single bound request model.
    @Post(":resource")
    @HttpCode(HttpStatus.OK)
    async customMethod(
        @Param("resource") resource: string,
        @Body() body: Record<string, unknown>,
        @BearerToken() token: string,
    ): Promise<Presenter> {
        const separatorIndex = resource.lastIndexOf(":");
        const projectId = resource.slice(0, separatorIndex);
        const verb = separatorIndex === -1 ? "" : resource.slice(separatorIndex + 1);

        switch (verb) {
            case "testIamPermissions":
                return this.testIamPermissions(projectId, body, token);
            case "getIamPolicy":
                return this.getIamPolicy(projectId, token);
            case "setIamPolicy":
                return this.setIamPolicy(projectId, body, token);
            default:
                throw new NotFoundException(`unknown custom method on project: ${verb || "(none)"}`);
        }
    }

    private async testIamPermissions(projectId: string, body: object, token: string): Promise<TestIamPermissionsPresenter> {
        const request = this.parse(TestIamPermissionsRequestModel, body);

        const permissions = await this.testProjectPermissionsUseCase.execute({
            creds: { token },
            params: { projectId, permissions: request.permissions },
        });

        return new TestIamPermissionsPresenter(permissions);
    }

    private async getIamPolicy(projectId: string, token: string): Promise<IamPolicyPresenter> {
        return new IamPolicyPresenter(await this.getProjectIamPolicyUseCase.execute({ creds: { token }, params: { projectId } }));
    }

    private async setIamPolicy(projectId: string, body: object, token: string): Promise<IamPolicyPresenter> {
        const request = this.parse(SetIamPolicyRequestModel, body);

        const policy = await this.setProjectIamPolicyUseCase.execute({
            creds: { token },
            params: { projectId, etag: request.policy.etag, bindings: request.policy.bindings },
        });

        return new IamPolicyPresenter(policy);
    }

    // The multiplexed verb handler receives the raw body, so per-verb request models are validated
    // here with the same rules and error shape as the module's global ValidationPipe.
    private parse<T extends object>(model: new () => T, body: object): T {
        const request = plainToInstance(model, body);
        const errors = validateSync(request, { whitelist: true, forbidNonWhitelisted: true });

        if (errors.length > 0) {
            throw new BadRequestException(ClassValidatorError.stringifyConstraints(errors[0]));
        }

        return request;
    }
}
