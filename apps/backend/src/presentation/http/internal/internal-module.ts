import { BadRequestException, MiddlewareConsumer, Module, NestModule, RequestMethod, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { raw } from "express";

import { EnvironmentRepository } from "../../../application/interfaces/repositories/environment-repository";
import {
    SessionOwnershipRepository,
} from "../../../application/interfaces/repositories/session-ownership-repository";
import {
    RecordEnvironmentHeartbeatUseCase,
} from "../../../application/use-cases/environments/record-environment-heartbeat-use-case";
import {
    UploadSessionLogsUseCase,
} from "../../../application/use-cases/environments/upload-session-logs-use-case";
import {
    UploadSessionVideoUseCase,
} from "../../../application/use-cases/environments/upload-session-video-use-case";
import { ClassValidatorError } from "../../../domain/utils/class-validator/class-validator-error";
import {
    AgentTokenServiceProvider,
} from "../../../infrastructure/agent-token/agent-token-service-provider";
import { EnvironmentDataSource } from "../../../infrastructure/data-sources/database/postgres/environment-data-source";
import {
    SessionOwnershipDataSource,
} from "../../../infrastructure/data-sources/database/postgres/session-ownership-data-source";
import {
    StorageDestinationDataSource,
} from "../../../infrastructure/data-sources/database/postgres/storage-destination-data-source";
import { PostgresModule } from "../../../infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import {
    ObjectStorageGatewayProvider,
} from "../../../infrastructure/gateways/object-storage/object-storage-gateway-provider";
import { LoggerModule } from "../../../infrastructure/logging/logger-module";
import { EnvironmentRepositoryImpl } from "../../../infrastructure/repositories/environment-repository-impl";
import {
    SessionOwnershipRepositoryImpl,
} from "../../../infrastructure/repositories/session-ownership-repository-impl";
import {
    StorageDestinationRepositoryProvider,
} from "../../../infrastructure/repositories/storage-destination-repository-provider";
import { AipExceptionFilter } from "../filters/aip-exception-filter";
import { ResponseInterceptor } from "../interceptors/response-interceptor";
import { ContextMiddleware } from "../middlewares/contex-middleware";
import { LoggingMiddleware } from "../middlewares/logging-middleware";
import { UrlRedactions } from "../middlewares/url-redaction";
import { sessionIdUrlRedaction } from "../session-route-redaction";

import { InternalAgentController } from "./controllers/agent/agent-controller";
import { InternalEnvironmentsController } from "./controllers/environments/environments-controller";
import { InternalAgentTokenGuard } from "./guards/internal-agent-token-guard";

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: [".env", `env/.env.${process.env.NODE_ENV || "development"}`],
        }),
        PostgresModule,
        LoggerModule,
    ],
    controllers: [
        InternalEnvironmentsController,
        InternalAgentController,
    ],
    providers: [
        RecordEnvironmentHeartbeatUseCase,
        UploadSessionLogsUseCase,
        UploadSessionVideoUseCase,

        { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
        { provide: SessionOwnershipRepository, useClass: SessionOwnershipRepositoryImpl },
        StorageDestinationRepositoryProvider,
        ObjectStorageGatewayProvider,

        EnvironmentDataSource,
        SessionOwnershipDataSource,
        StorageDestinationDataSource,
        AgentTokenServiceProvider,

        // A session id is a capability secret; mask it out of request logs (session log/video upload routes).
        { provide: UrlRedactions, useValue: [sessionIdUrlRedaction] },

        {
            provide: APP_GUARD,
            useClass: InternalAgentTokenGuard,
        },
        {
            provide: APP_FILTER,
            useClass: AipExceptionFilter,
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
export class InternalModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer
            .apply(ContextMiddleware, LoggingMiddleware)
            .forRoutes("*");

        // Session logs (the :uploadSessionLogs custom method) arrive as raw bytes (text/plain or
        // octet-stream), not JSON, and can be multi-MB — so a dedicated raw body parser with its own limit
        // is applied to the environments custom-method route. It skips :heartbeat, whose body is JSON, by
        // content-type, so the default JSON parser still handles heartbeats.
        consumer
            .apply(raw({ type: ["application/octet-stream", "text/plain"], limit: "16mb" }))
            .forRoutes(
                { path: "internal/environments/:resource", method: RequestMethod.POST },
                { path: "internal/environments/:environment/sessions/:resource", method: RequestMethod.POST },
            );
    }
}
