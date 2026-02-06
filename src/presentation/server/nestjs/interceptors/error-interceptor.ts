import { 
    BadRequestException, 
    CallHandler, 
    ExecutionContext, 
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
import { NotFoundError } from "../../../../domain/entities/error/not-found-error";
import { UnauthenticatedError } from "../../../../domain/entities/error/unauthenticated-error";

@Injectable()
export class ErrorInterceptor implements NestInterceptor {
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
                    }

                    return throwError(() => new InternalServerErrorException());
                }),
            )
    }
}
