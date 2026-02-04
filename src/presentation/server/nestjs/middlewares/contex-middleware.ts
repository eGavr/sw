import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

import { AsyncLocalStorage } from "../../../../infrastructure/context/async-local-storage";

@Injectable()
export class ContextMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction): void {
        const requestId = req.get("x-request-id") || uuidv4();
        
        res.setHeader("x-request-id", requestId);
        
        AsyncLocalStorage.getInstance().run({ reqId: requestId }, () => next());
    }
}
