import { BadRequestException, Controller, HttpCode, HttpStatus, NotFoundException, Param, Post, Req } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import type { Request } from "express";

import {
    RecordEnvironmentHeartbeatUseCase,
} from "../../../../../application/use-cases/environments/record-environment-heartbeat-use-case";
import {
    UploadSessionLogsUseCase,
} from "../../../../../application/use-cases/environments/upload-session-logs-use-case";
import { ClassValidatorError } from "../../../../../domain/utils/class-validator/class-validator-error";

import { EnvironmentHeartbeatPresenter } from "./io/environment-heartbeat-presenter";
import { HeartbeatRequestModel } from "./io/heartbeat-request-model";
import { UploadSessionLogsPresenter } from "./io/upload-session-logs-presenter";

const heartbeatVerb = "heartbeat";
const uploadSessionLogsVerb = "uploadSessionLogs";

@Controller("internal/environments")
export class InternalEnvironmentsController {
    constructor(
        private readonly recordEnvironmentHeartbeatUseCase: RecordEnvironmentHeartbeatUseCase,
        private readonly uploadSessionLogsUseCase: UploadSessionLogsUseCase,
    ) {}

    // Custom methods (AIP-136): POST /internal/environments/{id}:{verb}. express matches "{id}:{verb}"
    // as one path segment, so the verb is split off the last ":" and dispatched here. `:heartbeat` carries
    // a JSON body; `:uploadSessionLogs` carries raw log bytes (see the express.raw route middleware).
    @Post(":resource")
    @HttpCode(HttpStatus.OK)
    async customMethod(
        @Param("resource") resource: string,
        @Req() request: Request,
    ): Promise<EnvironmentHeartbeatPresenter | UploadSessionLogsPresenter> {
        const separatorIndex = resource.lastIndexOf(":");
        const environmentId = resource.slice(0, separatorIndex);
        const verb = separatorIndex === -1 ? "" : resource.slice(separatorIndex + 1);

        switch (verb) {
            case heartbeatVerb:
                return this.heartbeat(environmentId, request);
            case uploadSessionLogsVerb:
                return this.uploadSessionLogs(environmentId, request);
            default:
                throw new NotFoundException(`unknown custom method on environment: ${verb || "(none)"}`);
        }
    }

    private async heartbeat(environmentId: string, request: Request): Promise<EnvironmentHeartbeatPresenter> {
        const body = this.parse(HeartbeatRequestModel, request.body);

        const environment = await this.recordEnvironmentHeartbeatUseCase.execute({
            environmentId,
            endpoint: body.endpoint,
            busy: body.busy,
        });

        return new EnvironmentHeartbeatPresenter(environment);
    }

    private async uploadSessionLogs(environmentId: string, request: Request): Promise<UploadSessionLogsPresenter> {
        const result = await this.uploadSessionLogsUseCase.execute({
            environmentId,
            body: Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0),
            contentType: request.headers["content-type"],
        });

        return new UploadSessionLogsPresenter(result.environmentId, result.stored);
    }

    // The multiplexed handler reads the raw request, so the JSON verb validates its body here with the
    // same rules and error shape as the module's global ValidationPipe.
    private parse<T extends object>(model: new () => T, body: unknown): T {
        const request = plainToInstance(model, body ?? {});
        const errors = validateSync(request, { whitelist: true, forbidNonWhitelisted: true });

        if (errors.length > 0) {
            throw new BadRequestException(ClassValidatorError.stringifyConstraints(errors[0]));
        }

        return request;
    }
}
