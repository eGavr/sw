import { 
    BadRequestException, 
    CallHandler, 
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

import { DomainError } from "../../../../domain/entities/error/domain-error";
import { InvalidArgumentError } from "../../../../domain/entities/error/invalid-argument-error";
import { NotFoundError } from "../../../../domain/entities/error/not-found/not-found-error";
import { PermissionDeniedError } from "../../../../domain/entities/error/permission-denied-error";
import { UnauthenticatedError } from "../../../../domain/entities/error/unauthenticated-error";
import { Logger } from "../../../../infrastructure/logging/logger";

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

                    if (err instanceof DomainError) {
                        if (err instanceof InvalidArgumentError) {
                            return throwError(() => new BadRequestException(err.message))
                        }

                        if (err instanceof NotFoundError) {
                            return throwError(() => new NotFoundException(err.message));
                        }

                        if (err instanceof UnauthenticatedError) {
                            return throwError(() => new UnauthorizedException(err.message));
                        }

                        if (err instanceof PermissionDeniedError) {
                            return throwError(() => new ForbiddenException(err.message))
                        }
                    } 

                    console.log(err);

                    this.logger.fatal(err.stack || err.message || err);

                    return throwError(() => new InternalServerErrorException());
                }),
            )
    }
}
