import { Inject, Injectable, NestMiddleware, Optional } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

import { Logger } from "../../../infrastructure/logging/logger";

import { redactUrl, UrlRedaction, UrlRedactions } from "./url-redaction";

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
    constructor(
        private readonly logger: Logger,
        // The sensitive segments to mask are declared by the modules that own the sensitive routes (e.g. a
        // session id is a capability secret); this middleware stays route-agnostic and just applies them.
        @Optional() @Inject(UrlRedactions) private readonly redactions: ReadonlyArray<UrlRedaction> = [],
    ) {}

    use(req: Request, res: Response, next: NextFunction): void {
        const startTime = Date.now();
        const { method, ip } = req;
        const url = redactUrl(req.originalUrl, this.redactions);
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
