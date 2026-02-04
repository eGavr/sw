import { Body, Controller, Get, Param, Post } from "@nestjs/common";

import { GetEnvironmentUseCase } from "../../../../../../../domain/use-cases/environments/get-environment-use-case";

import { CreateEnvironmentRequest } from "./dtos/create-environment-request";
import { CreateEnvironmentResponse } from "./dtos/create-environment-response";
import { GetEnvironmentRequest } from "./dtos/get-environment-request";
import { GetEnvironmentResponse } from "./dtos/get-environment-response";

@Controller("environments")
export class EnvironmentsController {
    constructor(
        private readonly getEnvironmentUseCase: GetEnvironmentUseCase,
    ) {}

    @Get(":environmentId")
    async getEnvironment(@Param() params: GetEnvironmentRequest): Promise<GetEnvironmentResponse> {
        return new GetEnvironmentResponse(await this.getEnvironmentUseCase.execute(params));
    }

    @Get()
    listEnvironments(): Array<unknown> {
        return [];
    }

    @Post()
    async createEnvironment(@Body() params: CreateEnvironmentRequest): Promise<CreateEnvironmentResponse> {
        return new CreateEnvironmentResponse({ id: "", platformName: params.platformName, platformVersion: params.platformVersion });
    }
}
