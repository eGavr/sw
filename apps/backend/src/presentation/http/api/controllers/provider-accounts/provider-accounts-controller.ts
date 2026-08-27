import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";

import {
    CreateProviderAccountUseCase,
} from "../../../../../application/use-cases/provider-accounts/create-provider-account-use-case";
import {
    DeleteProviderAccountUseCase,
} from "../../../../../application/use-cases/provider-accounts/delete-provider-account-use-case";
import {
    GetProviderAccountUseCase,
} from "../../../../../application/use-cases/provider-accounts/get-provider-account-use-case";
import {
    ListProviderAccountsUseCase,
} from "../../../../../application/use-cases/provider-accounts/list-provider-accounts-use-case";
import {
    UpdateProviderAccountUseCase,
} from "../../../../../application/use-cases/provider-accounts/update-provider-account-use-case";
import { BearerToken } from "../../../decorators/param/bearer-token";

import { CreateProviderAccountRequestModel } from "./io/create-provider-account-request-model";
import { ListProviderAccountsPresenter } from "./io/list-provider-accounts-presenter";
import { ProviderAccountPresenter } from "./io/provider-account-presenter";
import { UpdateProviderAccountRequestModel } from "./io/update-provider-account-request-model";

@Controller("projects/:project/providerAccounts")
export class ProviderAccountsController {
    constructor(
        private readonly createProviderAccountUseCase: CreateProviderAccountUseCase,
        private readonly listProviderAccountsUseCase: ListProviderAccountsUseCase,
        private readonly getProviderAccountUseCase: GetProviderAccountUseCase,
        private readonly updateProviderAccountUseCase: UpdateProviderAccountUseCase,
        private readonly deleteProviderAccountUseCase: DeleteProviderAccountUseCase,
    ) {}

    @Post()
    async createProviderAccount(
        @Param("project") project: string,
        @Body() body: CreateProviderAccountRequestModel,
        @BearerToken() token: string,
    ): Promise<ProviderAccountPresenter> {
        return new ProviderAccountPresenter(await this.createProviderAccountUseCase.execute({
            creds: { token },
            params: {
                projectId: project,
                provider: body.provider,
                platformName: body.platform,
                execution: body.execution,
                config: body.config,
            },
        }));
    }

    @Get()
    async listProviderAccounts(
        @Param("project") project: string,
        @BearerToken() token: string,
    ): Promise<ListProviderAccountsPresenter> {
        return new ListProviderAccountsPresenter(
            await this.listProviderAccountsUseCase.execute({ creds: { token }, params: { projectId: project } }),
        );
    }

    @Get(":providerAccount")
    async getProviderAccount(
        @Param("project") project: string,
        @Param("providerAccount") providerAccount: string,
        @BearerToken() token: string,
    ): Promise<ProviderAccountPresenter> {
        return new ProviderAccountPresenter(await this.getProviderAccountUseCase.execute({
            creds: { token },
            params: { projectId: project, providerAccountId: providerAccount },
        }));
    }

    @Patch(":providerAccount")
    async updateProviderAccount(
        @Param("project") project: string,
        @Param("providerAccount") providerAccount: string,
        @Body() body: UpdateProviderAccountRequestModel,
        @BearerToken() token: string,
    ): Promise<ProviderAccountPresenter> {
        return new ProviderAccountPresenter(await this.updateProviderAccountUseCase.execute({
            creds: { token },
            params: { projectId: project, providerAccountId: providerAccount, config: body.config },
        }));
    }

    // AIP-135 soft delete: returns the resource with its now-disabled state, not an empty body.
    @Delete(":providerAccount")
    async deleteProviderAccount(
        @Param("project") project: string,
        @Param("providerAccount") providerAccount: string,
        @BearerToken() token: string,
    ): Promise<ProviderAccountPresenter> {
        return new ProviderAccountPresenter(await this.deleteProviderAccountUseCase.execute({
            creds: { token },
            params: { projectId: project, providerAccountId: providerAccount },
        }));
    }
}
