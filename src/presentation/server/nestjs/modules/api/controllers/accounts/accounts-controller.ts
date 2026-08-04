import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, Query } from "@nestjs/common";

import { CreateAccountUseCase } from "../../../../../../../domain/use-cases/accounts/create-account-use-case";
import { GetAccountUseCase } from "../../../../../../../domain/use-cases/accounts/get-account-use-case";
import { ListAccountsUseCase } from "../../../../../../../domain/use-cases/accounts/list-accounts-use-case";
import { TestAccountPermissionsUseCase } from "../../../../../../../domain/use-cases/accounts/test-account-permissions-use-case";
import { BearerToken } from "../../../../decorators/param/bearer-token";
import { paginate } from "../../../../pagination/page";
import { PageRequestDto } from "../../../../pagination/page-request-dto";

import { AccountDto } from "./dtos/account-dto";
import { CreateAccountRequestDto } from "./dtos/create-account-request-dto";
import { ListAccountsResponseDto } from "./dtos/list-accounts-response-dto";
import { TestIamPermissionsRequestDto } from "./dtos/test-iam-permissions-request-dto";
import { TestIamPermissionsResponseDto } from "./dtos/test-iam-permissions-response-dto";

const testIamPermissionsVerb = "testIamPermissions";

@Controller("accounts")
export class AccountsController {
    constructor(
        private readonly createAccountUseCase: CreateAccountUseCase,
        private readonly getAccountUseCase: GetAccountUseCase,
        private readonly listAccountsUseCase: ListAccountsUseCase,
        private readonly testAccountPermissionsUseCase: TestAccountPermissionsUseCase,
    ) {}

    @Post()
    async createAccount(@Body() body: CreateAccountRequestDto, @BearerToken() token: string): Promise<AccountDto> {
        return new AccountDto(await this.createAccountUseCase.execute({
            creds: { token },
            params: { name: body.displayName, resources: body.resources },
        }));
    }

    @Get()
    async listAccounts(@Query() query: PageRequestDto, @BearerToken() token: string): Promise<ListAccountsResponseDto> {
        const accounts = await this.listAccountsUseCase.execute({ creds: { token } });
        const page = paginate(accounts, query.pageSize, query.pageToken);

        return new ListAccountsResponseDto(page.items, page.nextPageToken);
    }

    @Get(":account")
    async getAccount(@Param("account") account: string, @BearerToken() token: string): Promise<AccountDto> {
        return new AccountDto(await this.getAccountUseCase.execute({ creds: { token }, params: { accountId: account } }));
    }

    // Custom method (AIP-136 / google.iam.v1): POST /v1/accounts/{account}:testIamPermissions.
    // express matches "{account}:testIamPermissions" as a single path segment, so the verb is
    // split off the last ":" here rather than routed as its own path.
    @Post(":resource")
    @HttpCode(HttpStatus.OK)
    async testIamPermissions(
        @Param("resource") resource: string,
        @Body() body: TestIamPermissionsRequestDto,
        @BearerToken() token: string,
    ): Promise<TestIamPermissionsResponseDto> {
        const separatorIndex = resource.lastIndexOf(":");
        const verb = separatorIndex === -1 ? "" : resource.slice(separatorIndex + 1);

        if (verb !== testIamPermissionsVerb) {
            throw new NotFoundException(`unknown custom method on account: ${verb || "(none)"}`);
        }

        const permissions = await this.testAccountPermissionsUseCase.execute({
            creds: { token },
            params: { accountId: resource.slice(0, separatorIndex), permissions: body.permissions },
        });

        return new TestIamPermissionsResponseDto(permissions);
    }
}
