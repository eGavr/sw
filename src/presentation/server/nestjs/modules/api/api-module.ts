import "../../../../../infrastructure/tracing";

import { BadRequestException, MiddlewareConsumer, Module, NestModule, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";

import { CreateAccountUseCase } from "../../../../../application/use-cases/accounts/create-account-use-case";
import { GetAccountUseCase } from "../../../../../application/use-cases/accounts/get-account-use-case";
import { ListAccountsUseCase } from "../../../../../application/use-cases/accounts/list-accounts-use-case";
import { TestAccountPermissionsUseCase } from "../../../../../application/use-cases/accounts/test-account-permissions-use-case";
import { CreateEnvironmentUseCase } from "../../../../../application/use-cases/environments/create-environment-use-case";
import { DeleteEnvironmentUseCase } from "../../../../../application/use-cases/environments/delete-environment-use-case";
import { GetEnvironmentUseCase } from "../../../../../application/use-cases/environments/get-environment-use-case";
import { ListEnvironmentsUseCase } from "../../../../../application/use-cases/environments/list-environments-use-case";
import { ClassValidatorError } from "../../../../../domain/utils/class-validator/class-validator-error";
import {
    UserDataSourceProvider as AuthUserDataSourceProvider,
} from "../../../../../infrastructure/data-sources/auth/user-data-source-provider";
import { AccountDataSource } from "../../../../../infrastructure/data-sources/database/postgres/account-data-source";
import { EnvironmentDataSource } from "../../../../../infrastructure/data-sources/database/postgres/environment-data-source";
import { ProviderAccountDataSource } from "../../../../../infrastructure/data-sources/database/postgres/provider-account-data-source";
import { PostgresModule } from "../../../../../infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import { UserDataSource as PgUserDataSource } from "../../../../../infrastructure/data-sources/database/postgres/user-data-source";
import {
    UserPermissionDataSource as PgUserPermissionDataSource,
} from "../../../../../infrastructure/data-sources/database/postgres/user-permission-data-source";
import { LoggerModule } from "../../../../../infrastructure/logging/logger-module";
import { AccountRepository } from "../../../../../infrastructure/repositories/account-repository";
import { AccountUserPermissionRepository } from "../../../../../infrastructure/repositories/account-user-permission-repository";
import { EnvironmentRepository } from "../../../../../infrastructure/repositories/environment-repository";
import { ProviderAccountRepository } from "../../../../../infrastructure/repositories/provider-account-repository";
import { UserRepository } from "../../../../../infrastructure/repositories/user-repository";
import { AipExceptionFilter } from "../../filters/aip-exception-filter";
import { ResponseInterceptor } from "../../interceptors/response-interceptor";
import { ContextMiddleware } from "../../middlewares/contex-middleware";
import { LoggingMiddleware } from "../../middlewares/logging-middleware";

import { AccountsController } from "./controllers/accounts/accounts-controller";
import { EnvironmentsController } from "./controllers/environments/environments-controller";

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: [".env", `env/.env.${process.env.NODE_ENV || "development"}`],
        }),
        PostgresModule,
        LoggerModule,
    ],
    controllers: [
        AccountsController,
        EnvironmentsController,
    ],
    providers: [
        CreateEnvironmentUseCase,
        GetEnvironmentUseCase,
        ListEnvironmentsUseCase,
        DeleteEnvironmentUseCase,

        GetAccountUseCase,
        CreateAccountUseCase,
        ListAccountsUseCase,
        TestAccountPermissionsUseCase,

        AccountRepository,
        UserRepository,
        AccountUserPermissionRepository,
        EnvironmentRepository,
        ProviderAccountRepository,

        AccountDataSource,
        EnvironmentDataSource,
        ProviderAccountDataSource,
        AuthUserDataSourceProvider,
        PgUserDataSource,
        PgUserPermissionDataSource,

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
export class ApiModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer
            .apply(ContextMiddleware, LoggingMiddleware)
            .forRoutes("*");
    }
}
