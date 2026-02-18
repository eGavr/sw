import { Body, Controller, Get, Param, Post } from "@nestjs/common";

import { GetEnvironmentUseCase } from "../../../../../../../domain/use-cases/environments/get-environment-use-case";
import { BearerToken } from "../../../../decorators/param/bearer-token";

import { CreateEnvironmentRequest } from "./dtos/create-environment-request";
import { EnvironmentDto } from "./dtos/environment-dto";
import { GetEnvironmentRequest } from "./dtos/get-environment-request";

@Controller("environments")
export class EnvironmentsController {
    constructor(
        private readonly getEnvironmentUseCase: GetEnvironmentUseCase,
    ) {}

    @Get(":environmentId")
    async getEnvironment(
        @Param() params: GetEnvironmentRequest, 
        @BearerToken() token: string,
    ): Promise<EnvironmentDto> {
        return new EnvironmentDto(await this.getEnvironmentUseCase.execute({ creds: { token }, params }));
    }

    @Get()
    listEnvironments(): Array<unknown> {
        return [];
    }

    @Post()
    async createEnvironment(@Body() params: CreateEnvironmentRequest): Promise<EnvironmentDto> {
        return new EnvironmentDto({ id: "", platformName: params.platformName, platformVersion: params.platformVersion });
    }
}
