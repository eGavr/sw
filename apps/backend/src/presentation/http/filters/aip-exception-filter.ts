import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";
import type { Response } from "express";

import { Logger } from "../../../infrastructure/logging/logger";
import { domainErrorHttpStatus, domainErrorRpcStatus, rpcStatusFor } from "../errors/error-status";

type AipError = {
    code: number;
    status: string;
    message: string;
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
        const domainHttpStatus = domainErrorHttpStatus(exception);

        if (domainHttpStatus !== null) {
            return {
                code: domainHttpStatus,
                status: domainErrorRpcStatus(exception) ?? rpcStatusFor(domainHttpStatus),
                message: (exception as Error).message,
            };
        }

        if (exception instanceof HttpException) {
            const code = exception.getStatus();

            return { code, status: rpcStatusFor(code), message: this.httpMessage(exception) };
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
