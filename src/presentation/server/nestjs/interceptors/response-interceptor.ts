import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, Observable } from "rxjs";

import { Response } from "../dtos/response";

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
    intercept(_: ExecutionContext, next: CallHandler): Observable<object> | Promise<Observable<object>> {
        return next
            .handle()
            .pipe(map((data: Response) => data.toObject()));
    }
}
