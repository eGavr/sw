import { BadRequestException, MiddlewareConsumer, Module, NestModule, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";

import { EnvironmentDataSourceProvider } from "../../../../../data/data-sources/compute/environment-data-source-provider";
import { LocalComputeStore } from "../../../../../data/data-sources/compute/local/local-compute-store";
import { SessionDataSourceProvider } from "../../../../../data/data-sources/compute/session-data-source-provider";
import { EnvironmentRepository } from "../../../../../data/repositories/environment-repository";
import { SessionRepository } from "../../../../../data/repositories/session-repository";
import { CreateSessionUseCase } from "../../../../../domain/use-cases/sessions/create-session-use-case";
import { DeleteSessionUseCase } from "../../../../../domain/use-cases/sessions/delete-session-use-case";
import { ClassValidatorError } from "../../../../../domain/utils/class-validator/class-validator-error";
import { LoggerModule } from "../../../../../infrastructure/logging/logger-module";
import { ErrorInterceptor } from "../../interceptors/error-interceptor";
import { ResponseInterceptor } from "../../interceptors/response-interceptor";
import { ContextMiddleware } from "../../middlewares/contex-middleware";
import { LoggingMiddleware } from "../../middlewares/logging-middleware";

import { SessionsController } from "./controllers/sessions/sessions-controller";

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: [".env", `env/.env.${process.env.NODE_ENV || "development"}`],
        }),
        LoggerModule,
    ],
    controllers: [SessionsController],
    providers: [
        CreateSessionUseCase,
        DeleteSessionUseCase,

        SessionRepository,
        EnvironmentRepository,

        LocalComputeStore,
        EnvironmentDataSourceProvider,
        SessionDataSourceProvider,

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
            .apply(ContextMiddleware, LoggingMiddleware)
            .forRoutes("*");
    }
}
