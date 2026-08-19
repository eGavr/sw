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
import {
    UploadSessionVideoUseCase,
} from "../../../../../application/use-cases/environments/upload-session-video-use-case";
import { ClassValidatorError } from "../../../../../domain/utils/class-validator/class-validator-error";

import { EnvironmentHeartbeatPresenter } from "./io/environment-heartbeat-presenter";
import { HeartbeatRequestModel } from "./io/heartbeat-request-model";
import { UploadSessionLogsPresenter } from "./io/upload-session-logs-presenter";
import { UploadSessionVideoPresenter } from "./io/upload-session-video-presenter";

const heartbeatVerb = "heartbeat";
const uploadSessionLogsVerb = "uploadSessionLogs";
const uploadSessionVideoVerb = "uploadSessionVideo";

@Controller("internal/environments")
export class InternalEnvironmentsController {
    constructor(
        private readonly recordEnvironmentHeartbeatUseCase: RecordEnvironmentHeartbeatUseCase,
        private readonly uploadSessionLogsUseCase: UploadSessionLogsUseCase,
        private readonly uploadSessionVideoUseCase: UploadSessionVideoUseCase,
    ) {}

    // Custom methods (AIP-136): POST /internal/environments/{id}:{verb}. express matches "{id}:{verb}"
    // as one path segment, so the verb is split off the last ":" and dispatched here. `:heartbeat` carries
    // a JSON body; `:uploadSessionVideo` carries the mp4 as an unbuffered stream (its content-type is
    // outside the raw middleware, so the request body is piped straight through to storage). Session logs
    // are keyed by session, so they ride a session-scoped path instead (see uploadSessionLogsMethod).
    @Post(":resource")
    @HttpCode(HttpStatus.OK)
    async customMethod(
        @Param("resource") resource: string,
        @Req() request: Request,
    ): Promise<EnvironmentHeartbeatPresenter | UploadSessionVideoPresenter> {
        const separatorIndex = resource.lastIndexOf(":");
        const environmentId = resource.slice(0, separatorIndex);
        const verb = separatorIndex === -1 ? "" : resource.slice(separatorIndex + 1);

        switch (verb) {
            case heartbeatVerb:
                return this.heartbeat(environmentId, request);
            case uploadSessionVideoVerb:
                return this.uploadSessionVideo(environmentId, request);
            default:
                throw new NotFoundException(`unknown custom method on environment: ${verb || "(none)"}`);
        }
    }

    // POST /internal/environments/{env}/sessions/{sessionId}:uploadSessionLogs. The session id keys the
    // stored log (its fingerprint); the environment id still resolves which project's bucket to write to.
    // The agent sends the raw session id it read off the node — the fingerprinting happens in the domain.
    @Post(":environment/sessions/:resource")
    @HttpCode(HttpStatus.OK)
    async uploadSessionLogsMethod(
        @Param("environment") environmentId: string,
        @Param("resource") resource: string,
        @Req() request: Request,
    ): Promise<UploadSessionLogsPresenter> {
        const separatorIndex = resource.lastIndexOf(":");
        const sessionId = resource.slice(0, separatorIndex);
        const verb = separatorIndex === -1 ? "" : resource.slice(separatorIndex + 1);

        if (verb !== uploadSessionLogsVerb) {
            throw new NotFoundException(`unknown custom method on session: ${verb || "(none)"}`);
        }

        return this.uploadSessionLogs(environmentId, sessionId, request);
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

    private async uploadSessionLogs(
        environmentId: string,
        sessionId: string,
        request: Request,
    ): Promise<UploadSessionLogsPresenter> {
        const result = await this.uploadSessionLogsUseCase.execute({
            environmentId,
            sessionId,
            body: Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0),
            contentType: request.headers["content-type"],
        });

        return new UploadSessionLogsPresenter(result.environmentId, result.stored);
    }

    // The mp4 body is not buffered anywhere: `request` is the raw request stream, piped straight to the
    // project's storage as an S3 multipart upload, so an arbitrarily large recording never sits in memory.
    private async uploadSessionVideo(environmentId: string, request: Request): Promise<UploadSessionVideoPresenter> {
        const result = await this.uploadSessionVideoUseCase.execute({
            environmentId,
            body: request,
            contentType: request.headers["content-type"],
        });

        return new UploadSessionVideoPresenter(result.environmentId, result.stored);
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
