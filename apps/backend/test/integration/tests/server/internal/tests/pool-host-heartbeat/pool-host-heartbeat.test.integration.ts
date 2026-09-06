import { BadRequestException, INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";

import {
    CloudAccountRepository,
} from "../../../../../../../src/application/interfaces/repositories/cloud-account-repository";
import {
    EnvironmentRepository,
} from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import {
    PoolHostRepository,
} from "../../../../../../../src/application/interfaces/repositories/pool-host-repository";
import { ProjectRepository } from "../../../../../../../src/application/interfaces/repositories/project-repository";
import {
    RecordHostHeartbeatUseCase,
} from "../../../../../../../src/application/use-cases/host-pool/record-host-heartbeat-use-case";
import { CloudAccount } from "../../../../../../../src/domain/entities/cloud-account/cloud-account";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { HostPoolKey } from "../../../../../../../src/domain/entities/host-pool/host-pool-key";
import { PoolHost } from "../../../../../../../src/domain/entities/host-pool/pool-host";
import { PoolHostId } from "../../../../../../../src/domain/entities/host-pool/pool-host-id";
import { PoolHostState } from "../../../../../../../src/domain/entities/host-pool/pool-host-state";
import { ProjectId } from "../../../../../../../src/domain/entities/project/project-id";
import { User } from "../../../../../../../src/domain/entities/user/user";
import { ClassValidatorError } from "../../../../../../../src/domain/utils/class-validator/class-validator-error";
import {
    AgentTokenServiceProvider,
} from "../../../../../../../src/infrastructure/agent-token/agent-token-service-provider";
import {
    CloudAccountDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/cloud-account-data-source";
import {
    EnvironmentDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/environment-data-source";
import {
    PoolHostDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/pool-host-data-source";
import {
    ProjectDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/project-data-source";
import {
    PostgresModule,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import {
    HostTokenServiceProvider,
} from "../../../../../../../src/infrastructure/host-token/host-token-service-provider";
import { LoggerModule } from "../../../../../../../src/infrastructure/logging/logger-module";
import {
    CloudAccountRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/cloud-account-repository-impl";
import {
    EnvironmentRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/environment-repository-impl";
import {
    PoolHostRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/pool-host-repository-impl";
import {
    ProjectRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/project-repository-impl";
import {
    AipExceptionFilter,
} from "../../../../../../../src/presentation/http/filters/aip-exception-filter";
import {
    ResponseInterceptor,
} from "../../../../../../../src/presentation/http/interceptors/response-interceptor";
import {
    InternalPoolHostsController,
} from "../../../../../../../src/presentation/http/internal/controllers/pool-hosts/pool-hosts-controller";
import {
    InternalHostTokenGuard,
} from "../../../../../../../src/presentation/http/internal/guards/internal-host-token-guard";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { internalAgentToken } from "../../../utils/request/internal-agent-token";
import { internalHostToken } from "../../../utils/request/internal-host-token";

const hostIp = "10.128.0.15";
const launch = { avd: "sw-android-14", internalUrl: "http://cp:3002" };

describe("/internal/poolHosts/:id:heartbeat", () => {
    let app: INestApplication;
    let poolHostRepository: PoolHostRepository;
    let environmentRepository: EnvironmentRepository;
    let projectRepository: ProjectRepository;
    let cloudAccountRepository: CloudAccountRepository;

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ envFilePath: [".env", `env/.env.${process.env.NODE_ENV || "development"}`] }),
                PostgresModule,
                LoggerModule,
            ],
            controllers: [InternalPoolHostsController],
            providers: [
                RecordHostHeartbeatUseCase,
                ProjectDataSource,
                EnvironmentDataSource,
                CloudAccountDataSource,
                PoolHostDataSource,
                { provide: ProjectRepository, useClass: ProjectRepositoryImpl },
                { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
                { provide: CloudAccountRepository, useClass: CloudAccountRepositoryImpl },
                { provide: PoolHostRepository, useClass: PoolHostRepositoryImpl },
                AgentTokenServiceProvider,
                HostTokenServiceProvider,
                InternalHostTokenGuard,
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

        poolHostRepository = app.get(PoolHostRepository);
        environmentRepository = app.get(EnvironmentRepository);
        projectRepository = app.get(ProjectRepository);
        cloudAccountRepository = app.get(CloudAccountRepository);
    });

    afterEach(async () => {
        await app.close();
    });

    // A placement references a real environment row and a pool its real cloud account (FKs), so the
    // whole chain is seeded: project -> cloud account (+ optionally an environment for the seat).
    const seedContext = async (): Promise<{ projectId: string; cloudAccountId: string }> => {
        const externalId = UserFactory.createId();
        const project = await projectRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });
        await projectRepository.save(project);

        const cloudAccount = CloudAccount.create({
            projectId: ProjectId.fromString(project.id),
            type: "yandex-cloud",
        });
        await cloudAccountRepository.save(cloudAccount);

        return { projectId: project.id, cloudAccountId: cloudAccount.id };
    };

    const seedEnvironmentId = async (projectId: string): Promise<string> => {
        const environment = await environmentRepository.create({
            projectId: ProjectId.fromString(projectId),
            platform: Platform.fromObject({ name: "android", version: "14" }),
            applications: ApplicationList.fromObject([{ name: "chrome", version: "latest" }]),
        });

        return environment.id;
    };

    const seedHost = async (cloudAccountId: string, seat?: { environmentId: string }): Promise<PoolHost> => {
        const host = await poolHostRepository.create({
            poolKey: new HostPoolKey(cloudAccountId, uuidv4()),
            capacitySlots: 3,
        });

        if (seat) {
            await poolHostRepository.with(PoolHostId.fromString(host.id), (locked) => {
                locked.place(seat.environmentId, launch);
            });
        }

        return poolHostRepository.get(PoolHostId.fromString(host.id));
    };

    const heartbeat = (id: string, body: object, token = internalHostToken(id)): request.Test =>
        request(app.getHttpServer())
            .post(`/internal/poolHosts/${id}:heartbeat`)
            .set("authorization", `Bearer ${token}`)
            .send(body);

    test("responds UNAUTHENTICATED without a token", () => {
        return request(app.getHttpServer())
            .post(`/internal/poolHosts/${uuidv4()}:heartbeat`)
            .send({ hostIp })
            .expect(401);
    });

    test("responds UNAUTHENTICATED with a token for a different host", async () => {
        const { cloudAccountId } = await seedContext();
        const host = await seedHost(cloudAccountId);

        return heartbeat(host.id, { hostIp }, internalHostToken(uuidv4())).expect(401);
    });

    test("responds UNAUTHENTICATED with an environment agent token — the audiences are not interchangeable", async () => {
        const { cloudAccountId } = await seedContext();
        const host = await seedHost(cloudAccountId);

        return heartbeat(host.id, { hostIp }, internalAgentToken(host.id)).expect(401);
    });

    test("registers on the first check-in and answers with the desired seats", async () => {
        const { projectId, cloudAccountId } = await seedContext();
        const environmentId = await seedEnvironmentId(projectId);
        const host = await seedHost(cloudAccountId, { environmentId });

        const { body } = await heartbeat(host.id, { hostIp }).expect(200);

        expect(body.uid).toBe(host.id);
        expect(body.state).toBe(PoolHostState.Ready);
        expect(body.slots).toHaveLength(1);

        const [slot] = body.slots;
        expect(slot.environmentId).toBe(environmentId);
        expect(slot.slotIndex).toBe(0);
        expect(slot.ports).toEqual({ wd: 4600, appium: 4700, console: 5554 });
        expect(slot.launch).toEqual(launch);

        // The minted agent token really is the seat environment's identity.
        const payload = JSON.parse(Buffer.from(slot.agentToken.split(".")[1], "base64url").toString("utf8"));
        expect(payload.sub).toBe(environmentId);
        expect(payload.aud).toBe("sw-internal");

        const registered = await poolHostRepository.get(PoolHostId.fromString(host.id));
        expect(registered.state).toBe(PoolHostState.Ready);
        expect(registered.hostIp).toBe(hostIp);
        expect(registered.lastSeenAt).not.toBeNull();
    });

    test("a later check-in refreshes liveness and keeps answering the desired seats", async () => {
        const { cloudAccountId } = await seedContext();
        const host = await seedHost(cloudAccountId);

        await heartbeat(host.id, { hostIp }).expect(200);
        const first = (await poolHostRepository.get(PoolHostId.fromString(host.id))).lastSeenAt;

        const { body } = await heartbeat(host.id, { hostIp }).expect(200);

        expect(body.slots).toEqual([]);
        const second = (await poolHostRepository.get(PoolHostId.fromString(host.id))).lastSeenAt;
        expect(second?.getTime()).toBeGreaterThanOrEqual(first?.getTime() ?? Number.POSITIVE_INFINITY);
    });

    test("responds INVALID_ARGUMENT when the check-in omits hostIp", async () => {
        const { cloudAccountId } = await seedContext();
        const host = await seedHost(cloudAccountId);

        return heartbeat(host.id, {})
            .expect(400)
            .expect((response) => expect(response.body.error.status).toBe("INVALID_ARGUMENT"));
    });

    test("responds NOT_FOUND for a host the pool no longer knows", () => {
        const ghost = uuidv4();

        return heartbeat(ghost, { hostIp }).expect(404);
    });

    test("responds NOT_FOUND for an unknown custom verb", async () => {
        const { cloudAccountId } = await seedContext();
        const host = await seedHost(cloudAccountId);

        return request(app.getHttpServer())
            .post(`/internal/poolHosts/${host.id}:frobnicate`)
            .set("authorization", `Bearer ${internalHostToken(host.id)}`)
            .send({ hostIp })
            .expect(404);
    });

    describe("GET /internal/poolHosts/agent:download", () => {
        test("serves the pool-host agent to any valid host token — the route acts on no machine", () => {
            return request(app.getHttpServer())
                .get("/internal/poolHosts/agent:download")
                .set("authorization", `Bearer ${internalHostToken(uuidv4())}`)
                .expect(200)
                .expect("content-type", /shellscript/)
                .expect((response) => expect(response.text).toContain("#!/usr/bin/env bash"));
        });

        test("responds UNAUTHENTICATED without a token", () => {
            return request(app.getHttpServer()).get("/internal/poolHosts/agent:download").expect(401);
        });

        test("responds UNAUTHENTICATED for an environment agent token", () => {
            return request(app.getHttpServer())
                .get("/internal/poolHosts/agent:download")
                .set("authorization", `Bearer ${internalAgentToken(uuidv4())}`)
                .expect(401);
        });
    });
});
