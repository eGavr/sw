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
    MachineLeaseRepository,
} from "../../../../../../../src/application/interfaces/repositories/machine-lease-repository";
import { ProjectRepository } from "../../../../../../../src/application/interfaces/repositories/project-repository";
import {
    RecordLeaseHeartbeatUseCase,
} from "../../../../../../../src/application/use-cases/machine-pool/record-lease-heartbeat-use-case";
import { CloudAccount } from "../../../../../../../src/domain/entities/cloud-account/cloud-account";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { MachineLease } from "../../../../../../../src/domain/entities/machine-pool/machine-lease";
import { MachineLeaseId } from "../../../../../../../src/domain/entities/machine-pool/machine-lease-id";
import { MachineLeaseState } from "../../../../../../../src/domain/entities/machine-pool/machine-lease-state";
import { MachinePoolKey } from "../../../../../../../src/domain/entities/machine-pool/machine-pool-key";
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
    MachineLeaseDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/machine-lease-data-source";
import {
    ProjectDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/project-data-source";
import {
    PostgresModule,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import {
    LeaseTokenServiceProvider,
} from "../../../../../../../src/infrastructure/lease-token/lease-token-service-provider";
import { LoggerModule } from "../../../../../../../src/infrastructure/logging/logger-module";
import {
    CloudAccountRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/cloud-account-repository-impl";
import {
    EnvironmentRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/environment-repository-impl";
import {
    MachineLeaseRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/machine-lease-repository-impl";
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
    InternalMachineLeasesController,
} from "../../../../../../../src/presentation/http/internal/controllers/machine-leases/machine-leases-controller";
import {
    InternalLeaseTokenGuard,
} from "../../../../../../../src/presentation/http/internal/guards/internal-lease-token-guard";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { internalAgentToken } from "../../../utils/request/internal-agent-token";
import { internalLeaseToken } from "../../../utils/request/internal-lease-token";

const hostIp = "10.128.0.15";
const launch = { avd: "sw-android-14", internalUrl: "http://cp:3002" };

describe("/internal/machineLeases/:id:heartbeat", () => {
    let app: INestApplication;
    let machineLeaseRepository: MachineLeaseRepository;
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
            controllers: [InternalMachineLeasesController],
            providers: [
                RecordLeaseHeartbeatUseCase,
                ProjectDataSource,
                EnvironmentDataSource,
                CloudAccountDataSource,
                MachineLeaseDataSource,
                { provide: ProjectRepository, useClass: ProjectRepositoryImpl },
                { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
                { provide: CloudAccountRepository, useClass: CloudAccountRepositoryImpl },
                { provide: MachineLeaseRepository, useClass: MachineLeaseRepositoryImpl },
                AgentTokenServiceProvider,
                LeaseTokenServiceProvider,
                InternalLeaseTokenGuard,
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

        machineLeaseRepository = app.get(MachineLeaseRepository);
        environmentRepository = app.get(EnvironmentRepository);
        projectRepository = app.get(ProjectRepository);
        cloudAccountRepository = app.get(CloudAccountRepository);
    });

    afterEach(async () => {
        await app.close();
    });

    // A assignment references a real environment row and a pool its real cloud account (FKs), so the
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
            platform: Platform.fromObject({ name: "android", version: "14", deviceModel: "pixel-7" }),
            applications: ApplicationList.fromObject([{ nameAlias: "chrome" }]),
        });

        return environment.id;
    };

    const seedHost = async (cloudAccountId: string, seat?: { environmentId: string }): Promise<MachineLease> => {
        const lease = await machineLeaseRepository.create({
            poolKey: new MachinePoolKey(cloudAccountId, uuidv4()),
            slotCapacity: 3,
        });

        if (seat) {
            await machineLeaseRepository.with(MachineLeaseId.fromString(lease.id), (locked) => {
                locked.place(seat.environmentId, launch);
            });
        }

        return machineLeaseRepository.get(MachineLeaseId.fromString(lease.id));
    };

    const heartbeat = (id: string, body: object, token = internalLeaseToken(id)): request.Test =>
        request(app.getHttpServer())
            .post(`/internal/machineLeases/${id}:heartbeat`)
            .set("authorization", `Bearer ${token}`)
            .send(body);

    test("responds UNAUTHENTICATED without a token", () => {
        return request(app.getHttpServer())
            .post(`/internal/machineLeases/${uuidv4()}:heartbeat`)
            .send({ hostIp })
            .expect(401);
    });

    test("responds UNAUTHENTICATED with a token for a different lease", async () => {
        const { cloudAccountId } = await seedContext();
        const lease = await seedHost(cloudAccountId);

        return heartbeat(lease.id, { hostIp }, internalLeaseToken(uuidv4())).expect(401);
    });

    test("responds UNAUTHENTICATED with an environment agent token — the audiences are not interchangeable", async () => {
        const { cloudAccountId } = await seedContext();
        const lease = await seedHost(cloudAccountId);

        return heartbeat(lease.id, { hostIp }, internalAgentToken(lease.id)).expect(401);
    });

    test("registers on the first check-in and answers with the desired seats", async () => {
        const { projectId, cloudAccountId } = await seedContext();
        const environmentId = await seedEnvironmentId(projectId);
        const lease = await seedHost(cloudAccountId, { environmentId });

        const { body } = await heartbeat(lease.id, { hostIp }).expect(200);

        expect(body.uid).toBe(lease.id);
        expect(body.state).toBe(MachineLeaseState.Ready);
        expect(body.slots).toHaveLength(1);

        const [slot] = body.slots;
        expect(slot.environmentId).toBe(environmentId);
        expect(slot.slotIndex).toBe(0);
        expect(slot.ports).toEqual({ wd: 4600, appium: 4700, console: 5554, vnc: 5900 });
        expect(slot.launch).toEqual(launch);

        // The minted agent token really is the seat environment's identity.
        const payload = JSON.parse(Buffer.from(slot.agentToken.split(".")[1], "base64url").toString("utf8"));
        expect(payload.sub).toBe(environmentId);
        expect(payload.aud).toBe("sw-internal");

        const registered = await machineLeaseRepository.get(MachineLeaseId.fromString(lease.id));
        expect(registered.state).toBe(MachineLeaseState.Ready);
        expect(registered.hostIp).toBe(hostIp);
        expect(registered.lastSeenAt).not.toBeNull();
    });

    test("a later check-in refreshes liveness and keeps answering the desired seats", async () => {
        const { cloudAccountId } = await seedContext();
        const lease = await seedHost(cloudAccountId);

        await heartbeat(lease.id, { hostIp }).expect(200);
        const first = (await machineLeaseRepository.get(MachineLeaseId.fromString(lease.id))).lastSeenAt;

        const { body } = await heartbeat(lease.id, { hostIp }).expect(200);

        expect(body.slots).toEqual([]);
        const second = (await machineLeaseRepository.get(MachineLeaseId.fromString(lease.id))).lastSeenAt;
        expect(second?.getTime()).toBeGreaterThanOrEqual(first?.getTime() ?? Number.POSITIVE_INFINITY);
    });

    test("responds INVALID_ARGUMENT when the check-in omits hostIp", async () => {
        const { cloudAccountId } = await seedContext();
        const lease = await seedHost(cloudAccountId);

        return heartbeat(lease.id, {})
            .expect(400)
            .expect((response) => expect(response.body.error.status).toBe("INVALID_ARGUMENT"));
    });

    test("responds NOT_FOUND for a lease the pool no longer knows", () => {
        const ghost = uuidv4();

        return heartbeat(ghost, { hostIp }).expect(404);
    });

    test("responds NOT_FOUND for an unknown custom verb", async () => {
        const { cloudAccountId } = await seedContext();
        const lease = await seedHost(cloudAccountId);

        return request(app.getHttpServer())
            .post(`/internal/machineLeases/${lease.id}:frobnicate`)
            .set("authorization", `Bearer ${internalLeaseToken(lease.id)}`)
            .send({ hostIp })
            .expect(404);
    });

    describe("GET /internal/machineLeases/agent:download", () => {
        test("serves the machine-lease agent to any valid lease token — the route acts on no machine", () => {
            return request(app.getHttpServer())
                .get("/internal/machineLeases/agent:download")
                .set("authorization", `Bearer ${internalLeaseToken(uuidv4())}`)
                .expect(200)
                .expect("content-type", /shellscript/)
                .expect((response) => expect(response.text).toContain("#!/usr/bin/env bash"));
        });

        test("responds UNAUTHENTICATED without a token", () => {
            return request(app.getHttpServer()).get("/internal/machineLeases/agent:download").expect(401);
        });

        test("responds UNAUTHENTICATED for an environment agent token", () => {
            return request(app.getHttpServer())
                .get("/internal/machineLeases/agent:download")
                .set("authorization", `Bearer ${internalAgentToken(uuidv4())}`)
                .expect(401);
        });
    });
});
