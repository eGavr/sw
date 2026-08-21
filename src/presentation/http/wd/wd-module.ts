import { dirname } from "node:path";

import { BadRequestException, MiddlewareConsumer, Module, NestModule, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { static as serveStatic } from "express";
import type { NextFunction, Request, Response } from "express";

import { WebDriverSessionGateway } from "../../../application/interfaces/gateways/webdriver-session-gateway";
import { EnvironmentRepository } from "../../../application/interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../../application/interfaces/repositories/project-repository";
import { UserRepository } from "../../../application/interfaces/repositories/user-repository";
import { AccessControl } from "../../../application/services/access-control";
import { CreateSessionUseCase } from "../../../application/use-cases/sessions/create-session-use-case";
import { ClassValidatorError } from "../../../domain/utils/class-validator/class-validator-error";
import {
    UserDataSourceProvider as AuthUserDataSourceProvider,
} from "../../../infrastructure/data-sources/auth/user-data-source-provider";
import { EnvironmentDataSource } from "../../../infrastructure/data-sources/database/postgres/environment-data-source";
import { ProjectDataSource } from "../../../infrastructure/data-sources/database/postgres/project-data-source";
import { PostgresModule } from "../../../infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import { UserDataSource as PgUserDataSource } from "../../../infrastructure/data-sources/database/postgres/user-data-source";
import { WebDriverClient } from "../../../infrastructure/gateways/webdriver-session/webdriver-client";
import {
    WebDriverSessionGatewayImpl,
} from "../../../infrastructure/gateways/webdriver-session/webdriver-session-gateway-impl";
import { LoggerModule } from "../../../infrastructure/logging/logger-module";
import { EnvironmentRepositoryImpl } from "../../../infrastructure/repositories/environment-repository-impl";
import { ProjectRepositoryImpl } from "../../../infrastructure/repositories/project-repository-impl";
import { UserRepositoryImpl } from "../../../infrastructure/repositories/user-repository-impl";
import { ErrorInterceptor } from "../interceptors/error-interceptor";
import { ResponseInterceptor } from "../interceptors/response-interceptor";
import { ContextMiddleware } from "../middlewares/contex-middleware";
import { LoggingMiddleware } from "../middlewares/logging-middleware";
import { UrlRedactions } from "../middlewares/url-redaction";
import { sessionIdUrlRedaction } from "../session-route-redaction";

import { InteractiveController } from "./controllers/interactive/interactive-controller";
import { SessionsController } from "./controllers/sessions/sessions-controller";
import { WebDriverProxy } from "./webdriver-proxy";
import { WebSocketProxy } from "./websocket-proxy";

// The @novnc/novnc package only exports its RFB engine (`.` → core/rfb.js); the package root holds the
// engine's relative deps (core/, vendor/), so the whole root is served under /novnc/ for the viewer page.
const novncRoot = dirname(dirname(require.resolve("@novnc/novnc")));
const serveNovnc = serveStatic(novncRoot);

// Serves the noVNC engine under /novnc/ by stripping the prefix and delegating to express static. A plain
// middleware (not ServeStaticModule) so it reliably runs in the module — and thus in the integration test —
// ahead of the Nest router. `.forRoutes("*")` remounts each request route-relative, so `request.url` is "/"
// here; the real path is `request.originalUrl`, from which the /novnc prefix is stripped for express static.
const novncPrefix = "/novnc";

function novncStatic(request: Request, response: Response, next: NextFunction): void {
    const path = (request.originalUrl ?? "").split("?")[0];

    if (!path.startsWith(`${novncPrefix}/`)) {
        next();

        return;
    }

    request.url = path.slice(novncPrefix.length);
    serveNovnc(request, response, next);
}

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: [".env", `env/.env.${process.env.NODE_ENV || "development"}`],
        }),
        PostgresModule,
        LoggerModule,
    ],
    controllers: [SessionsController, InteractiveController],
    providers: [
        CreateSessionUseCase,

        AccessControl,

        { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
        { provide: UserRepository, useClass: UserRepositoryImpl },
        { provide: ProjectRepository, useClass: ProjectRepositoryImpl },
        { provide: WebDriverSessionGateway, useClass: WebDriverSessionGatewayImpl },

        WebDriverClient,
        EnvironmentDataSource,
        AuthUserDataSourceProvider,
        PgUserDataSource,
        ProjectDataSource,
        WebDriverProxy,
        WebSocketProxy,

        // A session id is a capability secret; mask it out of request logs (WebDriver commands + proxy routes).
        { provide: UrlRedactions, useValue: [sessionIdUrlRedaction] },

        {
            provide: APP_INTERCEPTOR,
            useClass: ErrorInterceptor,
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: ResponseInterceptor,
        },
        {
            provide: APP_PIPE,
            useValue: new ValidationPipe(
                {
                    whitelist: true,
                    forbidNonWhitelisted: true,
                    exceptionFactory: (errors): BadRequestException =>
                        new BadRequestException(ClassValidatorError.stringifyConstraints(errors[0])),
                },
            ),
        },
    ],
})
export class WdModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer
            .apply(novncStatic)
            .forRoutes("*");

        consumer
            .apply(ContextMiddleware, LoggingMiddleware)
            .forRoutes("*");
    }
}
