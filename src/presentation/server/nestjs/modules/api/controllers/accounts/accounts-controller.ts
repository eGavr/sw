import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";

import { CreateAccountUseCase } from "../../../../../../../domain/use-cases/accounts/create-account-use-case";
import { GetAccountUseCase } from "../../../../../../../domain/use-cases/accounts/get-account-use-case";
import { ListAccountPermissionsUseCase } from "../../../../../../../domain/use-cases/accounts/list-account-permissions-use-case";
import { ListAccountsUseCase } from "../../../../../../../domain/use-cases/accounts/list-accounts-use-case";
import { BearerToken } from "../../../../decorators/param/bearer-token";
import { paginate } from "../../../../pagination/page";
import { PageRequestDto } from "../../../../pagination/page-request-dto";

import { AccountDto } from "./dtos/account-dto";
import { CreateAccountRequestDto } from "./dtos/create-account-request-dto";
import { ListAccountPermissionsResponseDto } from "./dtos/list-account-permissions-response-dto";
import { ListAccountsResponseDto } from "./dtos/list-accounts-response-dto";

@Controller("accounts")
export class AccountsController {
    constructor(
        private readonly createAccountUseCase: CreateAccountUseCase,
        private readonly getAccountUseCase: GetAccountUseCase,
        private readonly listAccountsUseCase: ListAccountsUseCase,
        private readonly listAccountPermissionsUseCase: ListAccountPermissionsUseCase,
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

    @Get(":account/permissions")
    async listAccountPermissions(
        @Param("account") account: string,
        @BearerToken() token: string,
    ): Promise<ListAccountPermissionsResponseDto> {
        return new ListAccountPermissionsResponseDto(
            await this.listAccountPermissionsUseCase.execute({ creds: { token }, params: { accountId: account } }),
        );
    }
}
