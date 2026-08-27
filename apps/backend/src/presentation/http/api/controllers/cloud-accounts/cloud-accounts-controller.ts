import { Body, Controller, Get, Param, Post } from "@nestjs/common";

import {
    CreateCloudAccountUseCase,
} from "../../../../../application/use-cases/cloud-accounts/create-cloud-account-use-case";
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
}
