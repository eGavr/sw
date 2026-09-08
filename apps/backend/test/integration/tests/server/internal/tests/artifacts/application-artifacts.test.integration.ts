import { Readable } from "stream";

import { BadRequestException, INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { ObjectStorageGateway } from "../../../../../../../src/application/interfaces/gateways/object-storage-gateway";
import {
    RemoteArtifactGateway,
} from "../../../../../../../src/application/interfaces/gateways/remote-artifact-gateway";
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
    GetApplicationArtifactUseCase,
} from "../../../../../../../src/application/use-cases/environments/get-application-artifact-use-case";
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
import {
    ProjectDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/project-data-source";
import {
    SessionOwnershipDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/session-ownership-data-source";
import {
    StorageDestinationDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/storage-destination-data-source";
import {
    PostgresModule,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import {
    InMemoryObjectStorageGateway,
} from "../../../../../../../src/infrastructure/gateways/object-storage/in-memory-object-storage-gateway";
import { LoggerModule } from "../../../../../../../src/infrastructure/logging/logger-module";
import {
    EnvironmentRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/environment-repository-impl";
import {
    ProjectRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/project-repository-impl";
import {
    SessionOwnershipRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/session-ownership-repository-impl";
import {
    StorageDestinationRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/storage-destination-repository-impl";
import { AipExceptionFilter } from "../../../../../../../src/presentation/http/filters/aip-exception-filter";
import {
    ResponseInterceptor,
} from "../../../../../../../src/presentation/http/interceptors/response-interceptor";
import {
    InternalEnvironmentsController,
} from "../../../../../../../src/presentation/http/internal/controllers/environments/environments-controller";
import {
    InternalAgentTokenGuard,
} from "../../../../../../../src/presentation/http/internal/guards/internal-agent-token-guard";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { internalAgentToken } from "../../../utils/request/internal-agent-token";

// The one remote-host fake: the wrapper client over an EXTERNAL artifact host (the only thing the
// tests may mock). Keyed by URL.
class FakeRemoteArtifactGateway extends RemoteArtifactGateway {
    readonly artifacts = new Map<string, Buffer>();
    // Refs whose download dies after the first chunk — a store dropping the connection mid-transfer.
    readonly dying = new Set<string>();

    async fetch(url: string): Promise<{ body: Readable; contentType?: string } | null> {
        const found = this.artifacts.get(url);

        if (!found) {
            return null;
        }

        return { body: this.dying.has(url) ? dyingStream(found) : Readable.from(found), contentType: "application/octet-stream" };
    }
}

// Emits one chunk, then fails — the shape of a store hanging up half way through a big artifact.
function dyingStream(head: Buffer): Readable {
    let sent = false;

    return new Readable({
        read(): void {
            if (sent) {
                this.destroy(new Error("remote store hung up"));

                return;
            }

            sent = true;
            this.push(head);
        },
    });
}

describe("/internal/environments/:id/applications/:name:downloadApp|:downloadWebdriver", () => {
    let app: INestApplication;
    let remoteArtifacts: FakeRemoteArtifactGateway;

    beforeEach(async () => {
        remoteArtifacts = new FakeRemoteArtifactGateway();

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
                GetApplicationArtifactUseCase,
                ProjectDataSource,
                EnvironmentDataSource,
                SessionOwnershipDataSource,
                StorageDestinationDataSource,
                { provide: ProjectRepository, useClass: ProjectRepositoryImpl },
                { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
                { provide: SessionOwnershipRepository, useClass: SessionOwnershipRepositoryImpl },
                { provide: StorageDestinationRepository, useClass: StorageDestinationRepositoryImpl },
                { provide: ObjectStorageGateway, useClass: InMemoryObjectStorageGateway },
                { provide: RemoteArtifactGateway, useValue: remoteArtifacts },
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

        app = moduleRef.createNestApplication();
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    const seedEnvironment = async (applications: Array<object>): Promise<{ id: string, projectId: string }> => {
        const externalId = UserFactory.createId();
        const projectRepository = app.get(ProjectRepository);
        const project = await projectRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });
        await projectRepository.save(project);

        const environment = await app.get(EnvironmentRepository).create({
            projectId: ProjectId.fromString(project.id),
            platform: Platform.fromObject({ name: "android", version: "14", deviceModel: "pixel-7" }),
            applications: ApplicationList.fromObject(applications as never),
        });

        return { id: environment.id, projectId: project.id };
    };

    const download = (environmentId: string, resource: string): request.Test =>
        request(app.getHttpServer())
            .get(`/internal/environments/${environmentId}/applications/${resource}`)
            .set("authorization", `Bearer ${internalAgentToken(environmentId)}`);

    test("streams a custom build from the project's delegated bucket", async () => {
        const { id, projectId } = await seedEnvironment([{
            nameAlias: "myapp",
            versionAlias: "7.1",
            source: { type: "custom", appRef: "builds/app.apk", webdriverRef: "builds/driver" },
        }]);

        const destination = StorageDestination.create({ bucket: "team-bucket" });
        await app.get(StorageDestinationRepository).save(ProjectId.fromString(projectId), destination);
        await app.get<ObjectStorageGateway>(ObjectStorageGateway)
            .put(destination, destination.keyFor("builds/app.apk"), { body: Buffer.from("apk-bytes") });
        await app.get<ObjectStorageGateway>(ObjectStorageGateway)
            .put(destination, destination.keyFor("builds/driver"), { body: Buffer.from("driver-bytes") });

        const apk = await download(id, "myapp:downloadApp").expect(200);
        expect(apk.body.toString()).toBe("apk-bytes");

        const driver = await download(id, "myapp:downloadWebdriver").expect(200);
        expect(driver.body.toString()).toBe("driver-bytes");
    });

    test("streams a provided build from the install's remote store", async () => {
        remoteArtifacts.artifacts.set("https://store.test/chrome-152.zip", Buffer.from("chrome-bytes"));

        const { id } = await seedEnvironment([{
            nameAlias: "chrome",
            versionAlias: "152",
            source: { type: "provided", appRef: "https://store.test/chrome-152.zip" },
        }]);

        const { body } = await download(id, "chrome:downloadApp").expect(200);

        expect(body.toString()).toBe("chrome-bytes");
    });

    // A download dying in flight must not take the control plane with it: the stream's error used to
    // be unheard, and node ends the process on those (it did, twice, on the dev stand).
    test("survives a store that hangs up mid-download", async () => {
        remoteArtifacts.artifacts.set("https://store.test/chrome-152.zip", Buffer.from("head"));
        remoteArtifacts.dying.add("https://store.test/chrome-152.zip");

        const { id } = await seedEnvironment([{
            nameAlias: "chrome",
            versionAlias: "152",
            source: { type: "provided", appRef: "https://store.test/chrome-152.zip" },
        }]);

        await download(id, "chrome:downloadApp").catch(() => undefined);

        // The server is still there and still serving — that is the whole point of the test.
        await download(id, "chrome:downloadWebdriver").expect(404);
    });

    test("responds NOT_FOUND when the build carries no such artifact (preinstalled / no webdriver)", async () => {
        const { id } = await seedEnvironment([{ nameAlias: "settings", versionAlias: "14", source: { type: "provided" } }]);

        await download(id, "settings:downloadApp").expect(404);
        await download(id, "settings:downloadWebdriver").expect(404);
    });

    test("responds INVALID_ARGUMENT for a custom build when the project has no storage destination", async () => {
        const { id } = await seedEnvironment([{
            nameAlias: "myapp",
            source: { type: "custom", appRef: "builds/app.apk" },
        }]);

        return download(id, "myapp:downloadApp").expect(400);
    });

    test("responds UNAUTHENTICATED with a token for a different environment", async () => {
        const { id } = await seedEnvironment([{
            nameAlias: "myapp",
            source: { type: "custom", appRef: "builds/app.apk" },
        }]);
        const { id: other } = await seedEnvironment([{
            nameAlias: "myapp",
            source: { type: "custom", appRef: "builds/app.apk" },
        }]);

        return request(app.getHttpServer())
            .get(`/internal/environments/${id}/applications/myapp:downloadApp`)
            .set("authorization", `Bearer ${internalAgentToken(other)}`)
            .expect(401);
    });
});
