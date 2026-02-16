import "../../../../../infrastructure/tracing";

import { BadRequestException, MiddlewareConsumer, Module, NestModule, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";

import { PermissionDataSource } from "../../../../../data/data-sources/acl/local/permission-data-source";
import { UserDataSourceProvider } from "../../../../../data/data-sources/user/user-data-source-provider";
import { EnvironmentDataSource } from "../../../../../data/data-sources/ydb/environment-data-source";
import { YdbModule } from "../../../../../data/data-sources/ydb/ydb-module";
import { AccountRepository } from "../../../../../data/repositories/account-repository";
import { EnvironmentRepository } from "../../../../../data/repositories/environment-repository";
import { PermissionRepository } from "../../../../../data/repositories/permission-repository";
import { UserRepository } from "../../../../../data/repositories/user-repository";
import { CreateAccountUseCase } from "../../../../../domain/use-cases/accounts/create-environment-use-case";
import { GetEnvironmentUseCase } from "../../../../../domain/use-cases/environments/get-environment-use-case";
import { ClassValidatorError } from "../../../../../domain/utils/class-validator/class-validator-error";
import { LoggerModule } from "../../../../../infrastructure/logging/logger-module";
import { ErrorInterceptor } from "../../interceptors/error-interceptor";
import { ResponseInterceptor } from "../../interceptors/response-interceptor";
import { ContextMiddleware } from "../../middlewares/contex-middleware";
import { LoggingMiddleware } from "../../middlewares/logging-middleware";

import { AccountsController } from "./controllers/accounts/accounts-controller";
import { EnvironmentsController } from "./controllers/environments/environments-controller";

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: `env/.env.${process.env.NODE_ENV || "development"}`,
        }),
        YdbModule,
        LoggerModule,
    ],
    controllers: [
        AccountsController, 
        EnvironmentsController,
    ],
    providers: [
        CreateAccountUseCase,
        GetEnvironmentUseCase,

        AccountRepository,
        UserRepository,
        PermissionRepository,
        EnvironmentRepository,

        EnvironmentDataSource,
        UserDataSourceProvider,
        PermissionDataSource,
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
export class ApiModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer
            .apply(ContextMiddleware, LoggingMiddleware)
            .forRoutes("*");
    }
}
