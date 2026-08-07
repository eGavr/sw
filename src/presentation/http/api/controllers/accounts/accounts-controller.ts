import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";

import { CreateAccountUseCase } from "../../../../../application/use-cases/accounts/create-account-use-case";
import {
    GetAccountIamPolicyUseCase,
} from "../../../../../application/use-cases/accounts/get-account-iam-policy-use-case";
import { GetAccountUseCase } from "../../../../../application/use-cases/accounts/get-account-use-case";
import { ListAccountsUseCase } from "../../../../../application/use-cases/accounts/list-accounts-use-case";
import {
    SetAccountIamPolicyUseCase,
} from "../../../../../application/use-cases/accounts/set-account-iam-policy-use-case";
import { TestAccountPermissionsUseCase } from "../../../../../application/use-cases/accounts/test-account-permissions-use-case";
import { ClassValidatorError } from "../../../../../domain/utils/class-validator/class-validator-error";
import { BearerToken } from "../../../decorators/param/bearer-token";
import { paginate } from "../../../pagination/page";
import { PageRequestModel } from "../../../pagination/page-request-model";
import { Presenter } from "../../../presenters/presenter";

import { AccountPresenter } from "./io/account-presenter";
import { CreateAccountRequestModel } from "./io/create-account-request-model";
import { IamPolicyPresenter } from "./io/iam-policy-presenter";
import { ListAccountsPresenter } from "./io/list-accounts-presenter";
import { SetIamPolicyRequestModel } from "./io/set-iam-policy-request-model";
import { TestIamPermissionsPresenter } from "./io/test-iam-permissions-presenter";
import { TestIamPermissionsRequestModel } from "./io/test-iam-permissions-request-model";

@Controller("accounts")
export class AccountsController {
    constructor(
        private readonly createAccountUseCase: CreateAccountUseCase,
        private readonly getAccountUseCase: GetAccountUseCase,
        private readonly listAccountsUseCase: ListAccountsUseCase,
        private readonly testAccountPermissionsUseCase: TestAccountPermissionsUseCase,
        private readonly getAccountIamPolicyUseCase: GetAccountIamPolicyUseCase,
        private readonly setAccountIamPolicyUseCase: SetAccountIamPolicyUseCase,
    ) {}

    @Post()
    async createAccount(@Body() body: CreateAccountRequestModel, @BearerToken() token: string): Promise<AccountPresenter> {
        return new AccountPresenter(await this.createAccountUseCase.execute({
            creds: { token },
            params: { name: body.displayName, resources: body.resources },
        }));
    }

    @Get()
    async listAccounts(@Query() query: PageRequestModel, @BearerToken() token: string): Promise<ListAccountsPresenter> {
        const accounts = await this.listAccountsUseCase.execute({ creds: { token } });
        const page = paginate(accounts, query.pageSize, query.pageToken);

        return new ListAccountsPresenter(page.items, page.nextPageToken);
    }

    @Get(":account")
    async getAccount(@Param("account") account: string, @BearerToken() token: string): Promise<AccountPresenter> {
        return new AccountPresenter(await this.getAccountUseCase.execute({ creds: { token }, params: { accountId: account } }));
    }

    // Custom methods (AIP-136 / google.iam.v1): POST /v1/accounts/{account}:{verb}. express matches
    // "{account}:{verb}" as one path segment, so the verb is split off the last ":" and dispatched
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
        const accountId = resource.slice(0, separatorIndex);
        const verb = separatorIndex === -1 ? "" : resource.slice(separatorIndex + 1);

        switch (verb) {
            case "testIamPermissions":
                return this.testIamPermissions(accountId, body, token);
            case "getIamPolicy":
                return this.getIamPolicy(accountId, token);
            case "setIamPolicy":
                return this.setIamPolicy(accountId, body, token);
            default:
                throw new NotFoundException(`unknown custom method on account: ${verb || "(none)"}`);
        }
    }

    private async testIamPermissions(accountId: string, body: object, token: string): Promise<TestIamPermissionsPresenter> {
        const request = this.parse(TestIamPermissionsRequestModel, body);

        const permissions = await this.testAccountPermissionsUseCase.execute({
            creds: { token },
            params: { accountId, permissions: request.permissions },
        });

        return new TestIamPermissionsPresenter(permissions);
    }

    private async getIamPolicy(accountId: string, token: string): Promise<IamPolicyPresenter> {
        return new IamPolicyPresenter(await this.getAccountIamPolicyUseCase.execute({ creds: { token }, params: { accountId } }));
    }

    private async setIamPolicy(accountId: string, body: object, token: string): Promise<IamPolicyPresenter> {
        const request = this.parse(SetIamPolicyRequestModel, body);

        const policy = await this.setAccountIamPolicyUseCase.execute({
            creds: { token },
            params: { accountId, bindings: request.policy.bindings },
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
