import { Body, Controller, Get, Param, Post } from "@nestjs/common";

import { CreateAccountUseCase } from "../../../../../../../domain/use-cases/accounts/create-account-use-case";
import { GetAccountUseCase } from "../../../../../../../domain/use-cases/accounts/get-account-use-case";
import { ListAccountPermissionsUseCase } from "../../../../../../../domain/use-cases/accounts/list-account-permissions-use-case";
import { BearerToken } from "../../../../decorators/param/bearer-token";

import { AccountDto } from "./dtos/account-dto";
import { CreateAccountRequestDto } from "./dtos/create-account-request-dto";
import { ListAccountPermissionsResponseDto } from "./dtos/list-account-permissions-response-dto";

@Controller("accounts")
export class AccountsController {
    constructor(
        private readonly createAccountUseCase: CreateAccountUseCase,
        private readonly getAccountUseCase: GetAccountUseCase,
        private readonly listAccountPermissionsUseCase: ListAccountPermissionsUseCase,
    ) {}

    @Post()
    async createAccount(@Body() body: CreateAccountRequestDto, @BearerToken() token: string): Promise<AccountDto> {
        return new AccountDto(await this.createAccountUseCase.execute({
            creds: { token },
            params: { name: body.displayName, resources: body.resources },
        }));
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
