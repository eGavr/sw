import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";

import { CreateEnvironmentUseCase } from "../../../../../../../domain/use-cases/environments/create-environment-use-case";
import { DeleteEnvironmentUseCase } from "../../../../../../../domain/use-cases/environments/delete-environment-use-case";
import { GetEnvironmentUseCase } from "../../../../../../../domain/use-cases/environments/get-environment-use-case";
import { ListEnvironmentsUseCase } from "../../../../../../../domain/use-cases/environments/list-environments-use-case";
import { BearerToken } from "../../../../decorators/param/bearer-token";
import { paginate } from "../../../../pagination/page";
import { PageRequestModel } from "../../../../pagination/page-request-model";
import { EmptyPresenter } from "../../../../presenters/empty-presenter";

import { CreateEnvironmentRequestModel } from "./io/create-environment-request-model";
import { EnvironmentPresenter } from "./io/environment-presenter";
import { ListEnvironmentsPresenter } from "./io/list-environments-presenter";

@Controller("accounts/:account/environments")
export class EnvironmentsController {
    constructor(
        private readonly createEnvironmentUseCase: CreateEnvironmentUseCase,
        private readonly getEnvironmentUseCase: GetEnvironmentUseCase,
        private readonly listEnvironmentsUseCase: ListEnvironmentsUseCase,
        private readonly deleteEnvironmentUseCase: DeleteEnvironmentUseCase,
    ) {}

    @Post()
    async createEnvironment(
        @Param("account") account: string,
        @Body() body: CreateEnvironmentRequestModel,
        @BearerToken() token: string,
    ): Promise<EnvironmentPresenter> {
        return new EnvironmentPresenter(await this.createEnvironmentUseCase.execute({
            creds: { token },
            params: { accountId: account, platform: body.platform, applications: body.applications },
        }));
    }

    @Get()
    async listEnvironments(
        @Param("account") account: string,
        @Query() query: PageRequestModel,
        @BearerToken() token: string,
    ): Promise<ListEnvironmentsPresenter> {
        const environments = await this.listEnvironmentsUseCase.execute({ creds: { token }, params: { accountId: account } });
        const page = paginate(environments, query.pageSize, query.pageToken);

        return new ListEnvironmentsPresenter(page.items, page.nextPageToken);
    }

    @Get(":environment")
    async getEnvironment(@Param("environment") environment: string, @BearerToken() token: string): Promise<EnvironmentPresenter> {
        return new EnvironmentPresenter(
            await this.getEnvironmentUseCase.execute({ creds: { token }, params: { environmentId: environment } }),
        );
    }

    @Delete(":environment")
    async deleteEnvironment(@Param("environment") environment: string, @BearerToken() token: string): Promise<EmptyPresenter> {
        await this.deleteEnvironmentUseCase.execute({ creds: { token }, params: { environmentId: environment } });

        return new EmptyPresenter();
    }
}
