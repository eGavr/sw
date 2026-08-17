import { BadRequestException, INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { raw } from "express";
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
import { Execution } from "../../../../../../../src/domain/entities/environment/execution";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { ProjectId } from "../../../../../../../src/domain/entities/project/project-id";
import { ProviderAccountId } from "../../../../../../../src/domain/entities/provider-account/provider-account-id";
import { StorageDestination } from "../../../../../../../src/domain/entities/storage/storage-destination";
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

const secret = "test-internal-secret";
const destination = StorageDestination.create({ bucket: "test-videos", prefix: "videos" });

describe("/internal/environments/:id:uploadSessionVideo", () => {
    let app: INestApplication;
    let objectStorage: InMemoryObjectStorageGateway;

    let projectRepository: ProjectRepository;
    let providerAccountRepository: ProviderAccountRepository;
    let environmentRepository: EnvironmentRepository;
    let storageDestinationRepository: StorageDestinationRepository;

    beforeEach(async () => {
        // Stateful in-memory storage shared between the use-case (which writes) and the test (which reads
        // back). Bound by value so there is exactly one instance.
        objectStorage = new InMemoryObjectStorageGateway();

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
                { provide: ObjectStorageGateway, useValue: objectStorage },
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
        // Same raw parser as production: it covers logs (octet-stream/text-plain) but NOT video/mp4, so the
        // video body stays an unbuffered stream piped straight to storage.
        app.use(raw({ type: ["application/octet-stream", "text/plain"], limit: "16mb" }));
        await app.init();

        projectRepository = app.get(ProjectRepository);
        providerAccountRepository = app.get(ProviderAccountRepository);
        environmentRepository = app.get(EnvironmentRepository);
        storageDestinationRepository = app.get(StorageDestinationRepository);
    });

    afterEach(async () => {
        await app.close();
    });

    const seedEnvironment = async (withDestination: boolean): Promise<string> => {
        const externalId = UserFactory.createId();
        const project = await projectRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });
        await projectRepository.save(project);

        const providerAccount = await providerAccountRepository.create({
            projectId: ProjectId.fromString(project.id),
            provider: "local",
            platformName: "linux",
            execution: Execution.Container,
        });

        const environment = await environmentRepository.create({
            projectId: ProjectId.fromString(project.id),
            providerAccountId: ProviderAccountId.fromString(providerAccount.id),
            platform: Platform.fromObject({ name: "linux", version: "latest" }),
            applications: ApplicationList.fromObject([{ name: "chrome", version: "latest" }]),
        });

        if (withDestination) {
            await storageDestinationRepository.save(ProjectId.fromString(project.id), destination);
        }

        return environment.id;
    };

    const upload = (id: string, body: Buffer): request.Test =>
        request(app.getHttpServer())
            .post(`/internal/environments/${id}:uploadSessionVideo`)
            .set("x-internal-secret", secret)
            .set("content-type", "video/mp4")
            .send(body);

    test("streams the video into the project's destination and it reads back", async () => {
        const id = await seedEnvironment(true);
        const video = Buffer.from("fake-mp4-payload- -end");

        const { body } = await upload(id, video).expect(200);

        expect(body).toEqual({ uid: id, stored: true });

        const keys = await objectStorage.list(destination, destination.keyFor(`sessions/${id}`));
        expect(keys).toHaveLength(1);
        expect(keys[0].endsWith("/session.mp4")).toBe(true);

        const stored = await objectStorage.get(destination, keys[0]);
        expect(stored?.body.equals(video)).toBe(true);
    });

    test("no-ops when the project has no destination configured", async () => {
        const id = await seedEnvironment(false);

        const { body } = await upload(id, Buffer.from("some video")).expect(200);

        expect(body).toEqual({ uid: id, stored: false });
        expect(await objectStorage.list(destination, destination.keyFor(`sessions/${id}`))).toHaveLength(0);
    });

    test("responds UNAUTHENTICATED without the internal secret", async () => {
        const id = await seedEnvironment(true);

        return request(app.getHttpServer())
            .post(`/internal/environments/${id}:uploadSessionVideo`)
            .set("content-type", "video/mp4")
            .send(Buffer.from("video"))
            .expect(401);
    });

    test("responds NOT_FOUND for an unknown environment", () => {
        return upload(uuidv4(), Buffer.from("video"))
            .expect(404)
            .expect((response) => expect(response.body.error.status).toBe("NOT_FOUND"));
    });
});
