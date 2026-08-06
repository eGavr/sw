import { BadRequestException, MiddlewareConsumer, Module, NestModule, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";

import { CreateSessionUseCase } from "../../../application/use-cases/sessions/create-session-use-case";
import { ClassValidatorError } from "../../../domain/utils/class-validator/class-validator-error";
import {
    UserDataSourceProvider as AuthUserDataSourceProvider,
} from "../../../infrastructure/data-sources/auth/user-data-source-provider";
import { LocalComputeStore } from "../../../infrastructure/data-sources/compute/local/local-compute-store";
import { SessionDataSourceProvider } from "../../../infrastructure/data-sources/compute/session-data-source-provider";
import { AccountDataSource } from "../../../infrastructure/data-sources/database/postgres/account-data-source";
import { EnvironmentDataSource } from "../../../infrastructure/data-sources/database/postgres/environment-data-source";
import { ProviderAccountDataSource } from "../../../infrastructure/data-sources/database/postgres/provider-account-data-source";
import { PostgresModule } from "../../../infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import { UserDataSource as PgUserDataSource } from "../../../infrastructure/data-sources/database/postgres/user-data-source";
import {
    UserPermissionDataSource as PgUserPermissionDataSource,
} from "../../../infrastructure/data-sources/database/postgres/user-permission-data-source";
import { LoggerModule } from "../../../infrastructure/logging/logger-module";
import { AccountRepository } from "../../../infrastructure/repositories/account-repository";
import { AccountUserPermissionRepository } from "../../../infrastructure/repositories/account-user-permission-repository";
import { EnvironmentRepository } from "../../../infrastructure/repositories/environment-repository";
import { ProviderAccountRepository } from "../../../infrastructure/repositories/provider-account-repository";
import { SessionRepository } from "../../../infrastructure/repositories/session-repository";
import { UserRepository } from "../../../infrastructure/repositories/user-repository";
import { ErrorInterceptor } from "../interceptors/error-interceptor";
import { ResponseInterceptor } from "../interceptors/response-interceptor";
import { ContextMiddleware } from "../middlewares/contex-middleware";
import { LoggingMiddleware } from "../middlewares/logging-middleware";

import { SessionsController } from "./controllers/sessions/sessions-controller";
import { WebDriverProxy } from "./webdriver-proxy";
import { WebSocketProxy } from "./websocket-proxy";

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: [".env", `env/.env.${process.env.NODE_ENV || "development"}`],
        }),
        PostgresModule,
        LoggerModule,
    ],
    controllers: [SessionsController],
    providers: [
        CreateSessionUseCase,

        SessionRepository,
        EnvironmentRepository,
        ProviderAccountRepository,
        UserRepository,
        AccountRepository,
        AccountUserPermissionRepository,

        LocalComputeStore,
        EnvironmentDataSource,
        ProviderAccountDataSource,
        SessionDataSourceProvider,
        AuthUserDataSourceProvider,
        PgUserDataSource,
        AccountDataSource,
        PgUserPermissionDataSource,
        WebDriverProxy,
        WebSocketProxy,

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
