import { Body, Controller, HttpCode, HttpStatus, NotFoundException, Param, Post } from "@nestjs/common";

import {
    RecordEnvironmentHeartbeatUseCase,
} from "../../../../../application/use-cases/environments/record-environment-heartbeat-use-case";

import { EnvironmentHeartbeatPresenter } from "./io/environment-heartbeat-presenter";
import { HeartbeatRequestModel } from "./io/heartbeat-request-model";

const heartbeatVerb = "heartbeat";

@Controller("internal/environments")
export class InternalEnvironmentsController {
    constructor(private readonly recordEnvironmentHeartbeatUseCase: RecordEnvironmentHeartbeatUseCase) {}

    // Custom method (AIP-136): POST /internal/environments/{id}:heartbeat. express matches
    // "{id}:heartbeat" as one path segment, so the verb is split off the last ":" here.
    @Post(":resource")
    @HttpCode(HttpStatus.OK)
    async heartbeat(
        @Param("resource") resource: string,
        @Body() body: HeartbeatRequestModel,
    ): Promise<EnvironmentHeartbeatPresenter> {
        const separatorIndex = resource.lastIndexOf(":");
        const verb = separatorIndex === -1 ? "" : resource.slice(separatorIndex + 1);

        if (verb !== heartbeatVerb) {
            throw new NotFoundException(`unknown custom method on environment: ${verb || "(none)"}`);
        }

        const environment = await this.recordEnvironmentHeartbeatUseCase.execute({
            environmentId: resource.slice(0, separatorIndex),
            endpoint: body.endpoint,
            busy: body.busy,
        });

        return new EnvironmentHeartbeatPresenter(environment);
    }
}
