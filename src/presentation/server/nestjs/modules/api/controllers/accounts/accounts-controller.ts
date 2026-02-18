import { Body, Controller, Get, Param, Post } from "@nestjs/common";

import { CreateAccountUseCase } from "../../../../../../../domain/use-cases/accounts/create-account-use-case";
import { GetAccountUseCase } from "../../../../../../../domain/use-cases/accounts/get-account-use-case";
import { ListAccountPermissionsUseCase } from "../../../../../../../domain/use-cases/accounts/list-account-permissions-use-case";
import { BearerToken } from "../../../../decorators/param/bearer-token";

import { AccountDto } from "./dtos/account-dto";
import { CreateAccountRequestDto } from "./dtos/create-account-request-dto";
import { GetAccountRequestDto } from "./dtos/get-account-request-dto";
import { ListAccountPermissionsRequestDto } from "./dtos/list-account-permissions-request-dto";
import { ListAccountPermissionsResponseDto } from "./dtos/list-account-permissions-response-dto";

@Controller("accounts")
export class AccountsController {
    constructor(
        private readonly getAccountUseCase: GetAccountUseCase,
        private readonly createAccountUseCase: CreateAccountUseCase,
        private readonly listAccountPermissionsUseCase: ListAccountPermissionsUseCase,
    ) {}

    @Get(":accountId")
    async getAccount(@Param() params: GetAccountRequestDto, @BearerToken() token: string): Promise<AccountDto> {
        return new AccountDto(await this.getAccountUseCase.execute({ creds: { token }, params }));
    }

    @Post()
    async createAccount(@Body() params: CreateAccountRequestDto, @BearerToken() token: string): Promise<AccountDto> {
        return new AccountDto(await this.createAccountUseCase.execute({ creds: { token }, params }));
    }

    @Get(":accountId/permissions")
    async listAccountPermissions(
        @Param() params: ListAccountPermissionsRequestDto, 
        @BearerToken() token: string,
    ): Promise<ListAccountPermissionsResponseDto> {
        return new ListAccountPermissionsResponseDto(await this.listAccountPermissionsUseCase.execute({ creds: { token }, params }));
    }
}
