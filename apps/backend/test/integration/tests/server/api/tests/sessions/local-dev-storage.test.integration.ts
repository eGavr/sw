import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { BadRequestException, HttpStatus, INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { raw } from "express";
import request from "supertest";

import {
    EnvironmentRepository,
} from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../../../../../../src/application/interfaces/repositories/project-repository";
import {
    SessionOwnershipRepository,
} from "../../../../../../../src/application/interfaces/repositories/session-ownership-repository";
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
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { ProjectId } from "../../../../../../../src/domain/entities/project/project-id";
import { StorageDestination } from "../../../../../../../src/domain/entities/storage/storage-destination";
import { User } from "../../../../../../../src/domain/entities/user/user";
import { ClassValidatorError } from "../../../../../../../src/domain/utils/class-validator/class-validator-error";
import {
    AgentTokenServiceProvider,
} from "../../../../../../../src/infrastructure/agent-token/agent-token-service-provider";
import {
    EnvironmentDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/environment-data-source";
import { ProjectDataSource } from "../../../../../../../src/infrastructure/data-sources/database/postgres/project-data-source";
import {
    SessionOwnershipDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/session-ownership-data-source";
import {
    StorageDestinationDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/storage-destination-data-source";
import { PostgresModule } from "../../../../../../../src/infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import {
    ObjectStorageGatewayProvider,
} from "../../../../../../../src/infrastructure/gateways/object-storage/object-storage-gateway-provider";
import { LoggerModule } from "../../../../../../../src/infrastructure/logging/logger-module";
import {
    EnvironmentRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/environment-repository-impl";
import { ProjectRepositoryImpl } from "../../../../../../../src/infrastructure/repositories/project-repository-impl";
import {
    SessionOwnershipRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/session-ownership-repository-impl";
import {
    StorageDestinationRepositoryProvider,
} from "../../../../../../../src/infrastructure/repositories/storage-destination-repository-provider";
import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { AipExceptionFilter } from "../../../../../../../src/presentation/http/filters/aip-exception-filter";
import { ResponseInterceptor } from "../../../../../../../src/presentation/http/interceptors/response-interceptor";
import {
    InternalEnvironmentsController,
} from "../../../../../../../src/presentation/http/internal/controllers/environments/environments-controller";
import {
    InternalAgentTokenGuard,
} from "../../../../../../../src/presentation/http/internal/guards/internal-agent-token-guard";
import { SessionRoute } from "../../../../../../../src/presentation/http/session-route";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";
import { internalAgentToken } from "../../../utils/request/internal-agent-token";

const wdSessionId = "wd-dev-storage-session";
const wireSessionId = SessionRoute.encode("http://node.internal:4444", wdSessionId);
const logs = "session started\nGET /url 200\nsession ended\n";
const video = Buffer.from("fake-mp4-payload-for-dev-storage");

// supertest does not parse video/mp4, so collect the streamed body into a Buffer to compare bytes.
const collectBinary = (response: request.Response, callback: (error: unknown, body: Buffer) => void): void => {
    const chunks: Array<Buffer> = [];
    response.on("data", (chunk: Buffer) => chunks.push(chunk));
    response.on("end", () => callback(null, Buffer.concat(chunks)));
};

// The local development storage path, end to end and cross-process: with LOG_STORAGE=fs the agent's
// upload (internal plane) lands as files on disk, and the api plane — a SEPARATE application over the
// same root — reads them back, for a project that never configured a storage destination (the install
// default kicks in). This is exactly the two-process dev topology, backed by one directory.
describe("local dev storage (LOG_STORAGE=fs)", () => {
    let fsRoot: string;
    let internalApp: INestApplication;
    let apiApp: TestingApp;

    beforeAll(() => {
        fsRoot = mkdtempSync(path.join(tmpdir(), "sw-dev-storage-"));
        process.env.LOG_STORAGE = "fs";
        process.env.LOG_STORAGE_FS_ROOT = fsRoot;
    });

    afterAll(() => {
        delete process.env.LOG_STORAGE;
        delete process.env.LOG_STORAGE_FS_ROOT;
        rmSync(fsRoot, { recursive: true, force: true });
    });

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
                EnvironmentDataSource,
                SessionOwnershipDataSource,
                StorageDestinationDataSource,
                { provide: ProjectRepository, useClass: ProjectRepositoryImpl },
                { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
                { provide: SessionOwnershipRepository, useClass: SessionOwnershipRepositoryImpl },
                StorageDestinationRepositoryProvider,
                ObjectStorageGatewayProvider,
                AgentTokenServiceProvider,
                { provide: APP_GUARD, useClass: InternalAgentTokenGuard },
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

        internalApp = moduleRef.createNestApplication();
        internalApp.use(raw({ type: ["application/octet-stream", "text/plain"], limit: "16mb" }));
        await internalApp.init();

        apiApp = await TestingApp.create(ApiModule);
    });

    afterEach(async () => {
        await internalApp.close();
        await apiApp.close();
    });

    // A project (grant-all owner) with a configured storage destination and one environment, seeded
    // through the shared Postgres — the honest dev flow (storage is configured, not defaulted).
    const seed = async (): Promise<{ owner: { authorization: string }, projectUid: string, environmentId: string }> => {
        const externalId = UserFactory.createId();
        const projectRepository = internalApp.get(ProjectRepository);
        const project = await projectRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });
        await projectRepository.save(project);

        await internalApp.get(StorageDestinationRepository).save(
            ProjectId.fromString(project.id),
            StorageDestination.create({ bucket: "dev-artifacts" }),
        );

        const environment = await internalApp.get(EnvironmentRepository).create({
            projectId: ProjectId.fromString(project.id),
            platform: Platform.fromObject({ name: "linux", version: "latest" }),
            applications: ApplicationList.fromObject([{ name: "chrome", version: "latest" }]),
        });

        return { owner: Authorization.forUser(externalId), projectUid: project.id, environmentId: environment.id };
    };

    test("logs uploaded by the agent are read back through the api across processes", async () => {
        const { owner, projectUid, environmentId } = await seed();

        const { body: uploaded } = await request(internalApp.getHttpServer())
            .post(`/internal/environments/${environmentId}/sessions/${wdSessionId}:uploadSessionLogs`)
            .set("authorization", `Bearer ${internalAgentToken(environmentId)}`)
            .set("content-type", "text/plain")
            .send(logs)
            .expect(200);

        expect(uploaded).toEqual({ uid: environmentId, stored: true });

        const { body } = await request(apiApp.getHttpServer())
            .get(`/projects/${projectUid}/sessions/${wireSessionId}/logs`)
            .set(owner)
            .expect(HttpStatus.OK);

        expect(body).toEqual({ content: logs });
    });

    test("video uploaded by the agent streams back through the api across processes", async () => {
        const { owner, projectUid, environmentId } = await seed();

        await request(internalApp.getHttpServer())
            .post(`/internal/environments/${environmentId}/sessions/${wdSessionId}:uploadSessionVideo`)
            .set("authorization", `Bearer ${internalAgentToken(environmentId)}`)
            .set("content-type", "video/mp4")
            .send(video)
            .expect(200);

        const response = await request(apiApp.getHttpServer())
            .get(`/projects/${projectUid}/sessions/${wireSessionId}/video`)
            .set(owner)
            .buffer(true)
            .parse(collectBinary)
            .expect(HttpStatus.OK);

        expect(response.headers["content-type"]).toContain("video/mp4");
        expect((response.body as Buffer).equals(video)).toBe(true);
    });
});
