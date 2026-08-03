import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";

import { CreateEnvironmentUseCase } from "../../../../../../../domain/use-cases/environments/create-environment-use-case";
import { DeleteEnvironmentUseCase } from "../../../../../../../domain/use-cases/environments/delete-environment-use-case";
import { GetEnvironmentUseCase } from "../../../../../../../domain/use-cases/environments/get-environment-use-case";
import { ListEnvironmentsUseCase } from "../../../../../../../domain/use-cases/environments/list-environments-use-case";
import { BearerToken } from "../../../../decorators/param/bearer-token";
import { EmptyResponseDto } from "../../../../dtos/empty-response-dto";
import { paginate } from "../../../../pagination/page";
import { PageRequestDto } from "../../../../pagination/page-request-dto";

import { CreateEnvironmentRequestDto } from "./dtos/create-environment-request-dto";
import { EnvironmentDto } from "./dtos/environment-dto";
import { ListEnvironmentsResponseDto } from "./dtos/list-environments-response-dto";

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
        @Body() body: CreateEnvironmentRequestDto,
        @BearerToken() token: string,
    ): Promise<EnvironmentDto> {
        return new EnvironmentDto(await this.createEnvironmentUseCase.execute({
            creds: { token },
            params: { accountId: account, platform: body.platform, application: body.application },
        }));
    }

    @Get()
    async listEnvironments(
        @Param("account") account: string,
        @Query() query: PageRequestDto,
        @BearerToken() token: string,
    ): Promise<ListEnvironmentsResponseDto> {
        const environments = await this.listEnvironmentsUseCase.execute({ creds: { token }, params: { accountId: account } });
        const page = paginate(environments, query.pageSize, query.pageToken);

        return new ListEnvironmentsResponseDto(page.items, page.nextPageToken);
    }

    @Get(":environment")
    async getEnvironment(@Param("environment") environment: string, @BearerToken() token: string): Promise<EnvironmentDto> {
        return new EnvironmentDto(
            await this.getEnvironmentUseCase.execute({ creds: { token }, params: { environmentId: environment } }),
        );
    }

    @Delete(":environment")
    async deleteEnvironment(@Param("environment") environment: string, @BearerToken() token: string): Promise<EmptyResponseDto> {
        await this.deleteEnvironmentUseCase.execute({ creds: { token }, params: { environmentId: environment } });

        return new EmptyResponseDto();
    }
}
