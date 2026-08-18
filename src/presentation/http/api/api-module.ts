import "../../../infrastructure/tracing";

import { BadRequestException, MiddlewareConsumer, Module, NestModule, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";

import { EnvironmentRepository } from "../../../application/interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../../application/interfaces/repositories/project-repository";
import { ProviderAccountRepository } from "../../../application/interfaces/repositories/provider-account-repository";
import {
    StorageDestinationRepository,
} from "../../../application/interfaces/repositories/storage-destination-repository";
import { UserRepository } from "../../../application/interfaces/repositories/user-repository";
import { AccessControl } from "../../../application/services/access-control";
import { CreateEnvironmentUseCase } from "../../../application/use-cases/environments/create-environment-use-case";
import { DeleteEnvironmentUseCase } from "../../../application/use-cases/environments/delete-environment-use-case";
import { GetEnvironmentUseCase } from "../../../application/use-cases/environments/get-environment-use-case";
import { ListEnvironmentsUseCase } from "../../../application/use-cases/environments/list-environments-use-case";
import { CreateProjectUseCase } from "../../../application/use-cases/projects/create-project-use-case";
import {
    GetProjectIamPolicyUseCase,
} from "../../../application/use-cases/projects/get-project-iam-policy-use-case";
import { GetProjectUseCase } from "../../../application/use-cases/projects/get-project-use-case";
import { ListProjectsUseCase } from "../../../application/use-cases/projects/list-projects-use-case";
import {
    SetProjectIamPolicyUseCase,
} from "../../../application/use-cases/projects/set-project-iam-policy-use-case";
import { TestProjectPermissionsUseCase } from "../../../application/use-cases/projects/test-project-permissions-use-case";
import {
    GetProjectStorageDestinationUseCase,
} from "../../../application/use-cases/storage-destinations/get-project-storage-destination-use-case";
import {
    SetProjectStorageDestinationUseCase,
} from "../../../application/use-cases/storage-destinations/set-project-storage-destination-use-case";
import { ClassValidatorError } from "../../../domain/utils/class-validator/class-validator-error";
import {
    UserDataSourceProvider as AuthUserDataSourceProvider,
} from "../../../infrastructure/data-sources/auth/user-data-source-provider";
import { EnvironmentDataSource } from "../../../infrastructure/data-sources/database/postgres/environment-data-source";
import { ProjectDataSource } from "../../../infrastructure/data-sources/database/postgres/project-data-source";
import { ProviderAccountDataSource } from "../../../infrastructure/data-sources/database/postgres/provider-account-data-source";
import {
    StorageDestinationDataSource,
} from "../../../infrastructure/data-sources/database/postgres/storage-destination-data-source";
import { PostgresModule } from "../../../infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import { UserDataSource as PgUserDataSource } from "../../../infrastructure/data-sources/database/postgres/user-data-source";
import { LoggerModule } from "../../../infrastructure/logging/logger-module";
import { EnvironmentRepositoryImpl } from "../../../infrastructure/repositories/environment-repository-impl";
import { ProjectRepositoryImpl } from "../../../infrastructure/repositories/project-repository-impl";
import { ProviderAccountRepositoryImpl } from "../../../infrastructure/repositories/provider-account-repository-impl";
import {
    StorageDestinationRepositoryImpl,
} from "../../../infrastructure/repositories/storage-destination-repository-impl";
import { UserRepositoryImpl } from "../../../infrastructure/repositories/user-repository-impl";
import { AipExceptionFilter } from "../filters/aip-exception-filter";
import { ResponseInterceptor } from "../interceptors/response-interceptor";
import { ContextMiddleware } from "../middlewares/contex-middleware";
import { LoggingMiddleware } from "../middlewares/logging-middleware";

import { EnvironmentsController } from "./controllers/environments/environments-controller";
import { ProjectsController } from "./controllers/projects/projects-controller";
import {
    StorageDestinationController,
} from "./controllers/storage-destination/storage-destination-controller";

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: [".env", `env/.env.${process.env.NODE_ENV || "development"}`],
        }),
        PostgresModule,
        LoggerModule,
    ],
    controllers: [
        ProjectsController,
        EnvironmentsController,
        StorageDestinationController,
    ],
    providers: [
        CreateEnvironmentUseCase,
        GetEnvironmentUseCase,
        ListEnvironmentsUseCase,
        DeleteEnvironmentUseCase,

        GetProjectUseCase,
        CreateProjectUseCase,
        ListProjectsUseCase,
        TestProjectPermissionsUseCase,
        GetProjectIamPolicyUseCase,
        SetProjectIamPolicyUseCase,

        GetProjectStorageDestinationUseCase,
        SetProjectStorageDestinationUseCase,

        AccessControl,

        { provide: ProjectRepository, useClass: ProjectRepositoryImpl },
        { provide: UserRepository, useClass: UserRepositoryImpl },
        { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
        { provide: ProviderAccountRepository, useClass: ProviderAccountRepositoryImpl },
        { provide: StorageDestinationRepository, useClass: StorageDestinationRepositoryImpl },

        ProjectDataSource,
        EnvironmentDataSource,
        ProviderAccountDataSource,
        StorageDestinationDataSource,
        AuthUserDataSourceProvider,
        PgUserDataSource,

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
