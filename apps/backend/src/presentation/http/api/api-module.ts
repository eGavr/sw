import "../../../infrastructure/tracing";

import { BadRequestException, MiddlewareConsumer, Module, NestModule, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";

import { CloudCatalog } from "../../../application/interfaces/cloud-catalog";
import {
    WebDriverSessionGateway,
} from "../../../application/interfaces/gateways/webdriver-session-gateway";
import { CloudAccountRepository } from "../../../application/interfaces/repositories/cloud-account-repository";
import { EnvironmentRepository } from "../../../application/interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../../application/interfaces/repositories/project-repository";
import {
    SessionOwnershipRepository,
} from "../../../application/interfaces/repositories/session-ownership-repository";
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
import {
    ListCloudTypesUseCase,
} from "../../../application/use-cases/cloud-types/list-cloud-types-use-case";
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
    GetEnvironmentSessionUseCase,
} from "../../../application/use-cases/sessions/get-environment-session-use-case";
import { GetSessionLogsUseCase } from "../../../application/use-cases/sessions/get-session-logs-use-case";
import { GetSessionVideoUseCase } from "../../../application/use-cases/sessions/get-session-video-use-case";
import {
    DeleteProjectStorageDestinationUseCase,
} from "../../../application/use-cases/storage-destinations/delete-project-storage-destination-use-case";
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
import {
    SessionOwnershipDataSource,
} from "../../../infrastructure/data-sources/database/postgres/session-ownership-data-source";
import {
    StorageDestinationDataSource,
} from "../../../infrastructure/data-sources/database/postgres/storage-destination-data-source";
import { PostgresModule } from "../../../infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import { UserDataSource as PgUserDataSource } from "../../../infrastructure/data-sources/database/postgres/user-data-source";
import {
    RegisteredCloudCatalog,
} from "../../../infrastructure/gateways/environment-provider/registered-cloud-catalog";
import {
    ObjectStorageGatewayProvider,
} from "../../../infrastructure/gateways/object-storage/object-storage-gateway-provider";
import { WebDriverClient } from "../../../infrastructure/gateways/webdriver-session/webdriver-client";
import {
    WebDriverSessionGatewayImpl,
} from "../../../infrastructure/gateways/webdriver-session/webdriver-session-gateway-impl";
import { LoggerModule } from "../../../infrastructure/logging/logger-module";
import { CloudAccountRepositoryImpl } from "../../../infrastructure/repositories/cloud-account-repository-impl";
import { EnvironmentRepositoryImpl } from "../../../infrastructure/repositories/environment-repository-impl";
import { ProjectRepositoryImpl } from "../../../infrastructure/repositories/project-repository-impl";
import {
    SessionOwnershipRepositoryImpl,
} from "../../../infrastructure/repositories/session-ownership-repository-impl";
import {
    StorageDestinationRepositoryProvider,
} from "../../../infrastructure/repositories/storage-destination-repository-provider";
import { UserRepositoryImpl } from "../../../infrastructure/repositories/user-repository-impl";
import { AipExceptionFilter } from "../filters/aip-exception-filter";
import { ResponseInterceptor } from "../interceptors/response-interceptor";
import { ContextMiddleware } from "../middlewares/contex-middleware";
import { LoggingMiddleware } from "../middlewares/logging-middleware";
import { UrlRedactions } from "../middlewares/url-redaction";
import { sessionIdUrlRedaction } from "../session-route-redaction";

import { CloudAccountsController } from "./controllers/cloud-accounts/cloud-accounts-controller";
import { CloudTypesController } from "./controllers/cloud-types/cloud-types-controller";
import { EnvironmentsController } from "./controllers/environments/environments-controller";
import { ProjectsController } from "./controllers/projects/projects-controller";
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
        CloudAccountsController,
        CloudTypesController,
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
        DeleteProjectStorageDestinationUseCase,

        CreateCloudAccountUseCase,
        ListCloudAccountsUseCase,
        GetCloudAccountUseCase,
        DeleteCloudAccountUseCase,

        ListCloudTypesUseCase,

        GetSessionLogsUseCase,
        GetSessionVideoUseCase,
        GetEnvironmentSessionUseCase,

        AccessControl,

        { provide: ProjectRepository, useClass: ProjectRepositoryImpl },
        { provide: UserRepository, useClass: UserRepositoryImpl },
        { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
        { provide: CloudAccountRepository, useClass: CloudAccountRepositoryImpl },
        StorageDestinationRepositoryProvider,
        { provide: SessionOwnershipRepository, useClass: SessionOwnershipRepositoryImpl },
        { provide: WebDriverSessionGateway, useClass: WebDriverSessionGatewayImpl },
        { provide: CloudCatalog, useClass: RegisteredCloudCatalog },
        ObjectStorageGatewayProvider,

        ProjectDataSource,
        EnvironmentDataSource,
        CloudAccountDataSource,
        SessionOwnershipDataSource,
        WebDriverClient,
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
