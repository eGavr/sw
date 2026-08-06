import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";
import type { Response } from "express";

import { ConflictError } from "../../../domain/entities/error/conflict-error";
import { DomainError } from "../../../domain/entities/error/domain-error";
import { InvalidArgumentError } from "../../../domain/entities/error/invalid-argument-error";
import { NotFoundError } from "../../../domain/entities/error/not-found/not-found-error";
import { PermissionDeniedError } from "../../../domain/entities/error/permission-denied-error";
import { UnauthenticatedError } from "../../../domain/entities/error/unauthenticated-error";
import { Logger } from "../../../infrastructure/logging/logger";

type AipError = {
    code: number;
    status: string;
    message: string;
};

const httpStatusToRpcCode: Record<number, string> = {
    400: "INVALID_ARGUMENT",
    401: "UNAUTHENTICATED",
    403: "PERMISSION_DENIED",
    404: "NOT_FOUND",
    409: "ABORTED",
    429: "RESOURCE_EXHAUSTED",
    500: "INTERNAL",
    501: "UNIMPLEMENTED",
    503: "UNAVAILABLE",
    504: "DEADLINE_EXCEEDED",
};

// Formats every error as the AIP-193 error response.
@Catch()
export class AipExceptionFilter implements ExceptionFilter {
    constructor(private readonly logger: Logger) {}

    catch(exception: unknown, host: ArgumentsHost): void {
        const error = this.toAipError(exception);

        if (error.code >= 500) {
            this.logger.fatal(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
        }

        host.switchToHttp().getResponse<Response>().status(error.code).json({ error });
    }

    private toAipError(exception: unknown): AipError {
        if (exception instanceof InvalidArgumentError) {
            return { code: 400, status: "INVALID_ARGUMENT", message: exception.message };
        }

        if (exception instanceof NotFoundError) {
            return { code: 404, status: "NOT_FOUND", message: exception.message };
        }

        if (exception instanceof UnauthenticatedError) {
            return { code: 401, status: "UNAUTHENTICATED", message: exception.message };
        }

        if (exception instanceof PermissionDeniedError) {
            return { code: 403, status: "PERMISSION_DENIED", message: exception.message };
        }

        if (exception instanceof ConflictError) {
            return { code: 409, status: "ABORTED", message: exception.message };
        }

        if (exception instanceof DomainError) {
            return { code: 500, status: "INTERNAL", message: exception.message };
        }

        if (exception instanceof HttpException) {
            const code = exception.getStatus();

            return { code, status: httpStatusToRpcCode[code] ?? "UNKNOWN", message: this.httpMessage(exception) };
        }

        return { code: 500, status: "INTERNAL", message: "internal error" };
    }

    private httpMessage(exception: HttpException): string {
        const response = exception.getResponse();

        if (typeof response === "string") {
            return response;
        }

        const message = (response as { message?: unknown }).message;

        return typeof message === "string" ? message : exception.message;
    }
}
