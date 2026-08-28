import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";

import {
    CreateCloudAccountUseCase,
} from "../../../../../application/use-cases/cloud-accounts/create-cloud-account-use-case";
import {
    DeleteCloudAccountUseCase,
} from "../../../../../application/use-cases/cloud-accounts/delete-cloud-account-use-case";
import {
    GetCloudAccountUseCase,
} from "../../../../../application/use-cases/cloud-accounts/get-cloud-account-use-case";
import {
    ListCloudAccountsUseCase,
} from "../../../../../application/use-cases/cloud-accounts/list-cloud-accounts-use-case";
import { BearerToken } from "../../../decorators/param/bearer-token";

import { CloudAccountPresenter } from "./io/cloud-account-presenter";
import { CreateCloudAccountRequestModel } from "./io/create-cloud-account-request-model";
import { ListCloudAccountsPresenter } from "./io/list-cloud-accounts-presenter";

@Controller("projects/:project/cloudAccounts")
export class CloudAccountsController {
    constructor(
        private readonly createCloudAccountUseCase: CreateCloudAccountUseCase,
        private readonly listCloudAccountsUseCase: ListCloudAccountsUseCase,
        private readonly getCloudAccountUseCase: GetCloudAccountUseCase,
        private readonly deleteCloudAccountUseCase: DeleteCloudAccountUseCase,
    ) {}

    @Post()
    async createCloudAccount(
        @Param("project") project: string,
        @Body() body: CreateCloudAccountRequestModel,
        @BearerToken() token: string,
    ): Promise<CloudAccountPresenter> {
        return new CloudAccountPresenter(await this.createCloudAccountUseCase.execute({
            creds: { token },
            params: { projectId: project, type: body.type, config: body.config },
        }));
    }

    @Get()
    async listCloudAccounts(
        @Param("project") project: string,
        @BearerToken() token: string,
    ): Promise<ListCloudAccountsPresenter> {
        return new ListCloudAccountsPresenter(
            await this.listCloudAccountsUseCase.execute({ creds: { token }, params: { projectId: project } }),
        );
    }

    @Get(":cloudAccount")
    async getCloudAccount(
        @Param("project") project: string,
        @Param("cloudAccount") cloudAccount: string,
        @BearerToken() token: string,
    ): Promise<CloudAccountPresenter> {
        return new CloudAccountPresenter(await this.getCloudAccountUseCase.execute({
            creds: { token },
            params: { projectId: project, cloudAccountId: cloudAccount },
        }));
    }

    // A real delete (empty response); refused with CONFLICT while environments still reference the account.
    @Delete(":cloudAccount")
    async deleteCloudAccount(
        @Param("project") project: string,
        @Param("cloudAccount") cloudAccount: string,
        @BearerToken() token: string,
    ): Promise<void> {
        await this.deleteCloudAccountUseCase.execute({
            creds: { token },
            params: { projectId: project, cloudAccountId: cloudAccount },
        });
    }
}
