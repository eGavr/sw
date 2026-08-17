import { BadRequestException, INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";

import { ObjectStorageGateway } from "../../../../../../../src/application/interfaces/gateways/object-storage-gateway";
import {
    EnvironmentRepository,
} from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../../../../../../src/application/interfaces/repositories/project-repository";
import {
    ProviderAccountRepository,
} from "../../../../../../../src/application/interfaces/repositories/provider-account-repository";
import {
    StorageDestinationRepository,
} from "../../../../../../../src/application/interfaces/repositories/storage-destination-repository";
import {
    RecordEnvironmentHeartbeatUseCase,
} from "../../../../../../../src/application/use-cases/environments/record-environment-heartbeat-use-case";
import {
    UploadSessionLogsUseCase,
} from "../../../../../../../src/application/use-cases/environments/upload-session-logs-use-case";
import {
    UploadSessionVideoUseCase,
} from "../../../../../../../src/application/use-cases/environments/upload-session-video-use-case";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { Environment } from "../../../../../../../src/domain/entities/environment/environment";
import { EnvironmentId } from "../../../../../../../src/domain/entities/environment/environment-id";
import { EnvironmentState } from "../../../../../../../src/domain/entities/environment/environment-state";
import { EnvironmentStatus } from "../../../../../../../src/domain/entities/environment/environment-status";
import { Execution } from "../../../../../../../src/domain/entities/environment/execution";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { ProjectId } from "../../../../../../../src/domain/entities/project/project-id";
import { ProviderAccountId } from "../../../../../../../src/domain/entities/provider-account/provider-account-id";
import { User } from "../../../../../../../src/domain/entities/user/user";
import { ClassValidatorError } from "../../../../../../../src/domain/utils/class-validator/class-validator-error";
import {
    EnvironmentDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/environment-data-source";
import { ProjectDataSource } from "../../../../../../../src/infrastructure/data-sources/database/postgres/project-data-source";
import {
    ProviderAccountDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/provider-account-data-source";
import {
    StorageDestinationDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/storage-destination-data-source";
import { PostgresModule } from "../../../../../../../src/infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import {
    InMemoryObjectStorageGateway,
} from "../../../../../../../src/infrastructure/gateways/object-storage/in-memory-object-storage-gateway";
import { LoggerModule } from "../../../../../../../src/infrastructure/logging/logger-module";
import {
    EnvironmentRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/environment-repository-impl";
import { ProjectRepositoryImpl } from "../../../../../../../src/infrastructure/repositories/project-repository-impl";
import {
    ProviderAccountRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/provider-account-repository-impl";
import {
    StorageDestinationRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/storage-destination-repository-impl";
import { AipExceptionFilter } from "../../../../../../../src/presentation/http/filters/aip-exception-filter";
import { ResponseInterceptor } from "../../../../../../../src/presentation/http/interceptors/response-interceptor";
import {
    InternalEnvironmentsController,
} from "../../../../../../../src/presentation/http/internal/controllers/environments/environments-controller";
import { InternalSecretGuard } from "../../../../../../../src/presentation/http/internal/guards/internal-secret-guard";
import { UserFactory } from "../../../utils/entities/user/user-factory";

const endpoint = "http://127.0.0.1:44444";
const secret = "test-internal-secret";

describe("/internal/environments/:id:heartbeat", () => {
    let app: INestApplication;
    let environmentRepository: EnvironmentRepository;

    let projectRepository: ProjectRepository;
    let providerAccountRepository: ProviderAccountRepository;

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ envFilePath: [".env", `env/.env.${process.env.NODE_ENV || "development"}`] }),
                PostgresModule,
                LoggerModule,
            ],
            controllers: [InternalEnvironmentsController],
            providers: [
                RecordEnvironmentHeartbeatUseCase,
                UploadSessionLogsUseCase,
                UploadSessionVideoUseCase,
                ProjectDataSource,
                ProviderAccountDataSource,
                EnvironmentDataSource,
                StorageDestinationDataSource,
                { provide: ProjectRepository, useClass: ProjectRepositoryImpl },
                { provide: ProviderAccountRepository, useClass: ProviderAccountRepositoryImpl },
                { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
                { provide: StorageDestinationRepository, useClass: StorageDestinationRepositoryImpl },
                { provide: ObjectStorageGateway, useClass: InMemoryObjectStorageGateway },
                { provide: APP_GUARD, useClass: InternalSecretGuard },
                { provide: APP_FILTER, useClass: AipExceptionFilter },
                { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
                {
                    provide: APP_PIPE,
                    useValue: new ValidationPipe({
                        whitelist: true,
                        forbidNonWhitelisted: true,
                        exceptionFactory: (errors): BadRequestException =>
                            new BadRequestException(ClassValidatorError.stringifyConstraints(errors[0])),
                    }),
                },
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();

        environmentRepository = app.get(EnvironmentRepository);
        projectRepository = app.get(ProjectRepository);
        providerAccountRepository = app.get(ProviderAccountRepository);
    });

    afterEach(async () => {
        await app.close();
    });

    const seedEnvironment = async (): Promise<string> => {
        const externalId = UserFactory.createId();
        const project = await projectRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });
        await projectRepository.save(project);

        const providerAccount = await providerAccountRepository.create({
            projectId: ProjectId.fromString(project.id),
            provider: "noop",
            platformName: "linux",
            execution: Execution.Container,
        });

        const environment = await environmentRepository.create({
            projectId: ProjectId.fromString(project.id),
            providerAccountId: ProviderAccountId.fromString(providerAccount.id),
            platform: Platform.fromObject({ name: "linux", version: "latest" }),
            applications: ApplicationList.fromObject([{ name: "chrome", version: "latest" }]),
        });

        return environment.id;
    };

    // enqueued -> starting -> preparing (what the worker leaves before the agent registers).
    const seedPreparingEnvironment = async (): Promise<string> => {
        await seedEnvironment();

        const claimed = await environmentRepository.withNextEnqueued((environment) => environment.claim());

        if (!claimed) {
            throw new Error("expected an enqueued environment to claim");
        }

        claimed.markDispatched();
        await environmentRepository.save(claimed);

        return claimed.id;
    };

    const heartbeat = (id: string, body: object): request.Test =>
        request(app.getHttpServer()).post(`/internal/environments/${id}:heartbeat`).set("x-internal-secret", secret).send(body);

    const reload = (id: string): Promise<Environment> => environmentRepository.get(EnvironmentId.fromString(id));

    test("responds UNAUTHENTICATED without the internal secret", () => {
        return request(app.getHttpServer())
            .post(`/internal/environments/${uuidv4()}:heartbeat`)
            .send({ endpoint, busy: false })
            .expect(401);
    });

    test("responds UNAUTHENTICATED with a wrong internal secret", () => {
        return request(app.getHttpServer())
            .post(`/internal/environments/${uuidv4()}:heartbeat`)
            .set("x-internal-secret", "wrong")
            .send({ endpoint, busy: false })
            .expect(401);
    });

    test("registers on the first heartbeat: preparing -> executing with the endpoint", async () => {
        const id = await seedPreparingEnvironment();

        const { body } = await heartbeat(id, { endpoint, busy: false }).expect(200);

        expect(body).toEqual({ uid: id, state: EnvironmentStatus.Active });

        const environment = await reload(id);
        expect(environment.state).toBe(EnvironmentState.Executing);
        expect(environment.endpoint).toBe(endpoint);
        expect(environment.busy).toBe(false);
    });

    test("a later heartbeat updates busy and refreshes liveness", async () => {
        const id = await seedPreparingEnvironment();
        await heartbeat(id, { endpoint, busy: false }).expect(200);

        await heartbeat(id, { busy: true }).expect(200);

        expect((await reload(id)).busy).toBe(true);
    });

    test("responds INVALID_ARGUMENT when the registration heartbeat omits the endpoint", async () => {
        const id = await seedPreparingEnvironment();

        return heartbeat(id, { busy: false })
            .expect(400)
            .expect((response) => expect(response.body.error.status).toBe("INVALID_ARGUMENT"));
    });

    test("responds ABORTED for a heartbeat on an environment that is not provisioning", async () => {
        const id = await seedEnvironment(); // still enqueued

        return heartbeat(id, { endpoint, busy: false })
            .expect(409)
            .expect((response) => expect(response.body.error.status).toBe("ABORTED"));
    });

    test("responds NOT_FOUND for a non-existent environment", () => {
        return heartbeat(uuidv4(), { endpoint, busy: false }).expect(404);
    });

    test("responds INVALID_ARGUMENT for a malformed environment id", () => {
        return heartbeat("not-a-uuid", { endpoint, busy: false }).expect(400);
    });

    test("responds NOT_FOUND for an unknown custom verb", async () => {
        const id = await seedPreparingEnvironment();

        return request(app.getHttpServer())
            .post(`/internal/environments/${id}:frobnicate`)
            .set("x-internal-secret", secret)
            .send({ busy: false })
            .expect(404);
    });
});
