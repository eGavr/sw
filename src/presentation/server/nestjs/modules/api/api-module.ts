import "../../../../../infrastructure/tracing";

import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";

import { EnvironmentDataSource } from "../../../../../data/data-sources/ydb/environment-data-source";
import { YdbModule } from "../../../../../data/data-sources/ydb/ydb-module";
import { EnvironmentRepository } from "../../../../../data/repositories/environment-repository";
import { GetEnvironmentUseCase } from "../../../../../domain/use-cases/environments/get-environment-use-case";
import { LoggerModule } from "../../../../../infrastructure/logging/logger-module";
import { ErrorInterceptor } from "../../interceptors/error-interceptor";
import { ResponseInterceptor } from "../../interceptors/response-interceptor";
import { ContextMiddleware } from "../../middlewares/contex-middleware";
import { LoggingMiddleware } from "../../middlewares/logging-middleware";

import { EnvironmentsController } from "./controllers/environments/environments-controller";

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: `env/.env.${process.env.NODE_ENV || "development"}`,
        }),
        YdbModule,
        LoggerModule,
    ],
    controllers: [EnvironmentsController],
    providers: [
        GetEnvironmentUseCase,
        EnvironmentRepository,
        EnvironmentDataSource,
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
                },
            ),
        },
    ],
})
export class ApiModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer
            .apply(ContextMiddleware, LoggingMiddleware)
            .forRoutes("*");
    }
}
