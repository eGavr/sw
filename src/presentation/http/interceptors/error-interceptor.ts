import {
    BadRequestException,
    CallHandler,
    ConflictException,
    ExecutionContext,
    ForbiddenException,
    HttpException,
    Injectable,
    InternalServerErrorException,
    NestInterceptor,
    NotFoundException,
    UnauthorizedException,
} from "@nestjs/common";
import { catchError, Observable, throwError } from "rxjs";

import { Logger } from "../../../infrastructure/logging/logger";
import { domainErrorHttpStatus } from "../errors/error-status";

const httpExceptionByStatus: Record<number, (message: string) => HttpException> = {
    400: (message: string): HttpException => new BadRequestException(message),
    401: (message: string): HttpException => new UnauthorizedException(message),
    403: (message: string): HttpException => new ForbiddenException(message),
    404: (message: string): HttpException => new NotFoundException(message),
    409: (message: string): HttpException => new ConflictException(message),
};

@Injectable()
export class ErrorInterceptor implements NestInterceptor {
    constructor(private readonly logger: Logger) {}

    intercept(_: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> | Promise<Observable<unknown>> {
        return next
            .handle()
            .pipe(
                catchError((err) => {
                    if (err instanceof HttpException) {
                        return throwError(() => err);
                    }

                    const httpStatus = domainErrorHttpStatus(err);
                    const toHttpException = httpStatus !== null ? httpExceptionByStatus[httpStatus] : undefined;

                    if (toHttpException) {
                        return throwError(() => toHttpException(err.message));
                    }

                    this.logger.fatal(err.stack || err.message || err);

                    return throwError(() => new InternalServerErrorException());
                }),
            );
    }
}
