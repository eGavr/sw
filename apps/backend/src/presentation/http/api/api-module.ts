import "../../../infrastructure/tracing";

import { BadRequestException, MiddlewareConsumer, Module, NestModule, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";

import { CloudCatalog } from "../../../application/interfaces/cloud-catalog";
import { CloudAccountRepository } from "../../../application/interfaces/repositories/cloud-account-repository";
import { EnvironmentRepository } from "../../../application/interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../../application/interfaces/repositories/project-repository";
import { ProviderAccountRepository } from "../../../application/interfaces/repositories/provider-account-repository";
import {
    StorageDestinationRepository,
} from "../../../application/interfaces/repositories/storage-destination-repository";
import { UserRepository } from "../../../application/interfaces/repositories/user-repository";
import { AccessControl } from "../../../application/services/access-control";
import {
    CreateCloudAccountUseCase,
} from "../../../application/use-cases/cloud-accounts/create-cloud-account-use-case";
import {
    DeleteCloudAccountUseCase,
} from "../../../application/use-cases/cloud-accounts/delete-cloud-account-use-case";
import {
    GetCloudAccountUseCase,
} from "../../../application/use-cases/cloud-accounts/get-cloud-account-use-case";
import {
    ListCloudAccountsUseCase,
} from "../../../application/use-cases/cloud-accounts/list-cloud-accounts-use-case";
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
    CreateProviderAccountUseCase,
} from "../../../application/use-cases/provider-accounts/create-provider-account-use-case";
import {
    DeleteProviderAccountUseCase,
} from "../../../application/use-cases/provider-accounts/delete-provider-account-use-case";
import {
    GetProviderAccountUseCase,
} from "../../../application/use-cases/provider-accounts/get-provider-account-use-case";
import {
    ListProviderAccountsUseCase,
} from "../../../application/use-cases/provider-accounts/list-provider-accounts-use-case";
import {
    UpdateProviderAccountUseCase,
} from "../../../application/use-cases/provider-accounts/update-provider-account-use-case";
import { GetSessionLogsUseCase } from "../../../application/use-cases/sessions/get-session-logs-use-case";
import { GetSessionVideoUseCase } from "../../../application/use-cases/sessions/get-session-video-use-case";
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
import {
    CloudAccountDataSource,
} from "../../../infrastructure/data-sources/database/postgres/cloud-account-data-source";
import { EnvironmentDataSource } from "../../../infrastructure/data-sources/database/postgres/environment-data-source";
import { ProjectDataSource } from "../../../infrastructure/data-sources/database/postgres/project-data-source";
import { ProviderAccountDataSource } from "../../../infrastructure/data-sources/database/postgres/provider-account-data-source";
import {
    StorageDestinationDataSource,
} from "../../../infrastructure/data-sources/database/postgres/storage-destination-data-source";
import { PostgresModule } from "../../../infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import { UserDataSource as PgUserDataSource } from "../../../infrastructure/data-sources/database/postgres/user-data-source";
import {
    ProviderCatalogProvider,
} from "../../../infrastructure/gateways/environment-provider/environment-provider-gateway-provider";
import {
    RegisteredCloudCatalog,
} from "../../../infrastructure/gateways/environment-provider/registered-cloud-catalog";
import {
    ObjectStorageGatewayProvider,
} from "../../../infrastructure/gateways/object-storage/object-storage-gateway-provider";
import { LoggerModule } from "../../../infrastructure/logging/logger-module";
import { CloudAccountRepositoryImpl } from "../../../infrastructure/repositories/cloud-account-repository-impl";
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
import { UrlRedactions } from "../middlewares/url-redaction";
import { sessionIdUrlRedaction } from "../session-route-redaction";

import { CloudAccountsController } from "./controllers/cloud-accounts/cloud-accounts-controller";
import { EnvironmentsController } from "./controllers/environments/environments-controller";
import { ProjectsController } from "./controllers/projects/projects-controller";
import {
    ProviderAccountsController,
} from "./controllers/provider-accounts/provider-accounts-controller";
import { SessionArtifactsController } from "./controllers/sessions/session-artifacts-controller";
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
        ProviderAccountsController,
        CloudAccountsController,
        StorageDestinationController,
        SessionArtifactsController,
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

        CreateProviderAccountUseCase,
        ListProviderAccountsUseCase,
        GetProviderAccountUseCase,
        UpdateProviderAccountUseCase,
        DeleteProviderAccountUseCase,

        CreateCloudAccountUseCase,
        ListCloudAccountsUseCase,
        GetCloudAccountUseCase,
        DeleteCloudAccountUseCase,

        GetSessionLogsUseCase,
        GetSessionVideoUseCase,

        AccessControl,

        { provide: ProjectRepository, useClass: ProjectRepositoryImpl },
        { provide: UserRepository, useClass: UserRepositoryImpl },
        { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
        { provide: ProviderAccountRepository, useClass: ProviderAccountRepositoryImpl },
        { provide: CloudAccountRepository, useClass: CloudAccountRepositoryImpl },
        { provide: StorageDestinationRepository, useClass: StorageDestinationRepositoryImpl },
        ProviderCatalogProvider,
        { provide: CloudCatalog, useClass: RegisteredCloudCatalog },
        ObjectStorageGatewayProvider,

        ProjectDataSource,
        EnvironmentDataSource,
        ProviderAccountDataSource,
        CloudAccountDataSource,
        StorageDestinationDataSource,
        AuthUserDataSourceProvider,
        PgUserDataSource,

        // A session id is a capability secret; mask it out of request logs (nested api read routes).
        { provide: UrlRedactions, useValue: [sessionIdUrlRedaction] },

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
