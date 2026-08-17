import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";

import { CreateAccountUseCase } from "../../../../../application/use-cases/projects/create-project-use-case";
import {
    GetAccountIamPolicyUseCase,
} from "../../../../../application/use-cases/projects/get-project-iam-policy-use-case";
import { GetAccountUseCase } from "../../../../../application/use-cases/projects/get-project-use-case";
import { ListAccountsUseCase } from "../../../../../application/use-cases/projects/list-projects-use-case";
import {
    SetAccountIamPolicyUseCase,
} from "../../../../../application/use-cases/projects/set-project-iam-policy-use-case";
import { TestAccountPermissionsUseCase } from "../../../../../application/use-cases/projects/test-project-permissions-use-case";
import { ClassValidatorError } from "../../../../../domain/utils/class-validator/class-validator-error";
import { BearerToken } from "../../../decorators/param/bearer-token";
import { paginate } from "../../../pagination/page";
import { PageRequestModel } from "../../../pagination/page-request-model";
import { Presenter } from "../../../presenters/presenter";

import { CreateAccountRequestModel } from "./io/create-project-request-model";
import { IamPolicyPresenter } from "./io/iam-policy-presenter";
import { ListAccountsPresenter } from "./io/list-projects-presenter";
import { ProjectPresenter } from "./io/project-presenter";
import { SetIamPolicyRequestModel } from "./io/set-iam-policy-request-model";
import { TestIamPermissionsPresenter } from "./io/test-iam-permissions-presenter";
import { TestIamPermissionsRequestModel } from "./io/test-iam-permissions-request-model";

@Controller("projects")
export class ProjectsController {
    constructor(
        private readonly createAccountUseCase: CreateAccountUseCase,
        private readonly getAccountUseCase: GetAccountUseCase,
        private readonly listAccountsUseCase: ListAccountsUseCase,
        private readonly testAccountPermissionsUseCase: TestAccountPermissionsUseCase,
        private readonly getAccountIamPolicyUseCase: GetAccountIamPolicyUseCase,
        private readonly setAccountIamPolicyUseCase: SetAccountIamPolicyUseCase,
    ) {}

    @Post()
    async createAccount(@Body() body: CreateAccountRequestModel, @BearerToken() token: string): Promise<ProjectPresenter> {
        return new ProjectPresenter(await this.createAccountUseCase.execute({
            creds: { token },
            params: { name: body.displayName, compute: body.compute },
        }));
    }

    @Get()
    async listAccounts(@Query() query: PageRequestModel, @BearerToken() token: string): Promise<ListAccountsPresenter> {
        const projects = await this.listAccountsUseCase.execute({ creds: { token } });
        const page = paginate(projects, query.pageSize, query.pageToken);

        return new ListAccountsPresenter(page.items, page.nextPageToken);
    }

    @Get(":project")
    async getAccount(@Param("project") project: string, @BearerToken() token: string): Promise<ProjectPresenter> {
        return new ProjectPresenter(await this.getAccountUseCase.execute({ creds: { token }, params: { projectId: project } }));
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

        const permissions = await this.testAccountPermissionsUseCase.execute({
            creds: { token },
            params: { projectId, permissions: request.permissions },
        });

        return new TestIamPermissionsPresenter(permissions);
    }

    private async getIamPolicy(projectId: string, token: string): Promise<IamPolicyPresenter> {
        return new IamPolicyPresenter(await this.getAccountIamPolicyUseCase.execute({ creds: { token }, params: { projectId } }));
    }

    private async setIamPolicy(projectId: string, body: object, token: string): Promise<IamPolicyPresenter> {
        const request = this.parse(SetIamPolicyRequestModel, body);

        const policy = await this.setAccountIamPolicyUseCase.execute({
            creds: { token },
            params: { projectId, bindings: request.policy.bindings },
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
