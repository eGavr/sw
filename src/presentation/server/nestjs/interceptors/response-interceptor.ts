import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, Observable } from "rxjs";

import { ResponseDto } from "../dtos/response-dto";

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
    intercept(_: ExecutionContext, next: CallHandler): Observable<unknown> | Promise<Observable<unknown>> {
        return next
            .handle()
            .pipe(map((data: ResponseDto | undefined) => (data && typeof data.toObject === "function" ? data.toObject() : data)));
    }
}
