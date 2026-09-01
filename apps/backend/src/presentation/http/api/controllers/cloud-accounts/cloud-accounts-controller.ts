import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, Post } from "@nestjs/common";

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
import {
    CloudAccountAccessProbe,
    TestCloudAccountAccessUseCase,
} from "../../../../../application/use-cases/cloud-accounts/test-cloud-account-access-use-case";
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
        private readonly testCloudAccountAccessUseCase: TestCloudAccountAccessUseCase,
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

    // AIP-136 custom method: POST projects/{project}/cloudAccounts/{cloudAccount}:test — the "cloud
    // available" probe the UI runs after connect (a read-only access check under our identity). The id and
    // verb share the last segment ("<id>:test") and both are dynamic, so the verb is split off the last
    // colon in the handler rather than by the route pattern.
    @Post(":target")
    @HttpCode(HttpStatus.OK)
    async custom(
        @Param("project") project: string,
        @Param("target") target: string,
        @BearerToken() token: string,
    ): Promise<CloudAccountAccessProbe> {
        const separator = target.lastIndexOf(":");
        const verb = separator < 0 ? "" : target.slice(separator + 1);

        if (verb !== "test") {
            throw new NotFoundException(`unknown custom method on cloudAccount: ${target}`);
        }

        return this.testCloudAccountAccessUseCase.execute({
            creds: { token },
            params: { projectId: project, cloudAccountId: target.slice(0, separator) },
        });
    }
}
