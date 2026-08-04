import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, Observable } from "rxjs";

import { Presenter } from "../presenters/presenter";

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
    intercept(_: ExecutionContext, next: CallHandler): Observable<unknown> | Promise<Observable<unknown>> {
        return next
            .handle()
            .pipe(map((data: Presenter | undefined) => (data && typeof data.present === "function" ? data.present() : data)));
    }
}
