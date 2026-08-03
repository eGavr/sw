import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";

import { CreateEnvironmentUseCase } from "../../../../../../../domain/use-cases/environments/create-environment-use-case";
import { DeleteEnvironmentUseCase } from "../../../../../../../domain/use-cases/environments/delete-environment-use-case";
import { GetEnvironmentUseCase } from "../../../../../../../domain/use-cases/environments/get-environment-use-case";
import { ListEnvironmentsUseCase } from "../../../../../../../domain/use-cases/environments/list-environments-use-case";
import { BearerToken } from "../../../../decorators/param/bearer-token";

import { CreateEnvironmentRequestDto } from "./dtos/create-environment-request-dto";
import { DeleteEnvironmentRequestDto } from "./dtos/delete-environment-request-dto";
import { EnvironmentDto } from "./dtos/environment-dto";
import { GetEnvironmentRequestDto } from "./dtos/get-environment-request-dto";
import { ListEnvironmentsRequestDto } from "./dtos/list-environments-request-dto";
import { ListEnvironmentsResponseDto } from "./dtos/list-environments-response-dto";

@Controller("environments")
export class EnvironmentsController {
    constructor(
        private readonly createEnvironmentUseCase: CreateEnvironmentUseCase,
        private readonly getEnvironmentUseCase: GetEnvironmentUseCase,
        private readonly listEnvironmentsUseCase: ListEnvironmentsUseCase,
        private readonly deleteEnvironmentUseCase: DeleteEnvironmentUseCase,
    ) {}

    @Post()
    async createEnvironment(
        @Body() params: CreateEnvironmentRequestDto,
        @BearerToken() token: string,
    ): Promise<EnvironmentDto> {
        return new EnvironmentDto(await this.createEnvironmentUseCase.execute({ creds: { token }, params }));
    }

    @Get()
    async listEnvironments(
        @Query() params: ListEnvironmentsRequestDto,
        @BearerToken() token: string,
    ): Promise<ListEnvironmentsResponseDto> {
        return new ListEnvironmentsResponseDto(await this.listEnvironmentsUseCase.execute({ creds: { token }, params }));
    }

    @Get(":environmentId")
    async getEnvironment(
        @Param() params: GetEnvironmentRequestDto,
        @BearerToken() token: string,
    ): Promise<EnvironmentDto> {
        return new EnvironmentDto(await this.getEnvironmentUseCase.execute({ creds: { token }, params }));
    }

    @Delete(":environmentId")
    async deleteEnvironment(
        @Param() params: DeleteEnvironmentRequestDto,
        @BearerToken() token: string,
    ): Promise<EnvironmentDto> {
        return new EnvironmentDto(await this.deleteEnvironmentUseCase.execute({ creds: { token }, params }));
    }
}
