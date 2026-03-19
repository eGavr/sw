import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, Observable } from "rxjs";

import { ResponseDto } from "../dtos/response-dto";

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
    intercept(_: ExecutionContext, next: CallHandler): Observable<object> | Promise<Observable<object>> {
        return next
            .handle()
            .pipe(map((data: ResponseDto) => data.toObject()));
    }
}
