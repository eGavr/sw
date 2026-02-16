import { Body, Controller, Post } from "@nestjs/common";

import { CreateAccountUseCase } from "../../../../../../../domain/use-cases/accounts/create-environment-use-case";
import { BearerToken } from "../../../../decorators/param/bearer-token";

import { CreateAccountRequest } from "./dtos/create-account-request";
import { CreateAccountResponse } from "./dtos/create-account-response";

@Controller("accounts")
export class AccountsController {
    constructor(
        private readonly createAccountUseCase: CreateAccountUseCase,
    ) {}

    @Post()
    async createAccount(@Body() params: CreateAccountRequest, @BearerToken() token: string): Promise<CreateAccountResponse> {
        return new CreateAccountResponse(await this.createAccountUseCase.execute({ creds: { token }, params }));
    }
}
