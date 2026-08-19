import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

import { Logger } from "../../../infrastructure/logging/logger";

import { redactSessionIds } from "./redact-session-ids";

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
    constructor(private readonly logger: Logger) {}

    use(req: Request, res: Response, next: NextFunction): void {
        const startTime = Date.now();
        const { method, ip } = req;
        // The session id is a capability secret, so it is masked out of the logged URL.
        const url = redactSessionIds(req.originalUrl);
        const userAgent = req.get("user-agent") || "";

        this.logger.log(`[START] ${method} ${url} - IP: ${ip} - UA: ${userAgent}`);

        res.on("finish", () => {
            const duration = Date.now() - startTime;
            const { statusCode } = res;
            const logLevel = statusCode >= 400 ? "error" : statusCode >= 300 ? "warn" : "log";

            this.logger[logLevel](`[END] ${method} ${url} ${statusCode} – ${duration}ms`);
        });

        next();
    }
}
