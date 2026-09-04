import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";

import { Logger as ApplicationLogger } from "../../../../../../../src/application/interfaces/logger";
import {
    CloudAccountRepository,
} from "../../../../../../../src/application/interfaces/repositories/cloud-account-repository";
import {
    EnvironmentRepository,
} from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import {
    PoolHostRepository,
} from "../../../../../../../src/application/interfaces/repositories/pool-host-repository";
import {
    ProjectRepository,
} from "../../../../../../../src/application/interfaces/repositories/project-repository";
import {
    DeprovisionDeletingEnvironmentsUseCase,
} from "../../../../../../../src/application/use-cases/environments/deprovision-deleting-environments-use-case";
import {
    PrepareNextEnvironmentUseCase,
} from "../../../../../../../src/application/use-cases/environments/prepare-next-environment-use-case";
import {
    PlaceWorkloadUseCase,
} from "../../../../../../../src/application/use-cases/host-pool/place-workload-use-case";
import {
    ReconcileHostPoolUseCase,
} from "../../../../../../../src/application/use-cases/host-pool/reconcile-host-pool-use-case";
import {
    RecordHostHeartbeatUseCase,
} from "../../../../../../../src/application/use-cases/host-pool/record-host-heartbeat-use-case";
import {
    ReleaseWorkloadUseCase,
} from "../../../../../../../src/application/use-cases/host-pool/release-workload-use-case";
import { CloudAccount } from "../../../../../../../src/domain/entities/cloud-account/cloud-account";
import { CloudAccountId } from "../../../../../../../src/domain/entities/cloud-account/cloud-account-id";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { EnvironmentId } from "../../../../../../../src/domain/entities/environment/environment-id";
import {
    EnvironmentQuotaPolicy,
} from "../../../../../../../src/domain/entities/environment/environment-quota";
import { EnvironmentState } from "../../../../../../../src/domain/entities/environment/environment-state";
import { Execution } from "../../../../../../../src/domain/entities/environment/execution";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { PoolHostId } from "../../../../../../../src/domain/entities/host-pool/pool-host-id";
import { PoolHostState } from "../../../../../../../src/domain/entities/host-pool/pool-host-state";
import { ProjectId } from "../../../../../../../src/domain/entities/project/project-id";
import { User } from "../../../../../../../src/domain/entities/user/user";
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
    EnvironmentProviderGatewayProvider,
} from "../../../../../../../src/infrastructure/gateways/environment-provider/environment-provider-gateway-provider";
import {
    HostProviderGatewayProvider,
} from "../../../../../../../src/infrastructure/gateways/host-provider/host-provider-gateway-provider";
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
import { UserFactory } from "../../../utils/entities/user/user-factory";

const noopLogger = { log: (): void => undefined, warn: (): void => undefined, error: (): void => undefined };

// The local baremetal route end to end with NOTHING mocked: the byo host provider's only external
// system is the operator (a log line), so the whole vertical — routing, bridge, pool, ownership —
// runs for real against Postgres. This is the CP half of "my Mac is the machine".
describe("host-pool placement (local byo route)", () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let projectRepository: ProjectRepository;
    let environmentRepository: EnvironmentRepository;
    let cloudAccountRepository: CloudAccountRepository;
    let poolHostRepository: PoolHostRepository;

    beforeEach(async () => {
        process.env.POOL_HOST_SLOTS = "2";

        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ envFilePath: [".env", `env/.env.${process.env.NODE_ENV || "development"}`] }),
                PostgresModule,
                LoggerModule,
            ],
            providers: [
                PrepareNextEnvironmentUseCase,
                DeprovisionDeletingEnvironmentsUseCase,
                PlaceWorkloadUseCase,
                ReleaseWorkloadUseCase,
                ReconcileHostPoolUseCase,
                RecordHostHeartbeatUseCase,
                ProjectDataSource,
                EnvironmentDataSource,
                CloudAccountDataSource,
                PoolHostDataSource,
                { provide: ProjectRepository, useClass: ProjectRepositoryImpl },
                { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
                { provide: CloudAccountRepository, useClass: CloudAccountRepositoryImpl },
                { provide: PoolHostRepository, useClass: PoolHostRepositoryImpl },
                { provide: ApplicationLogger, useValue: noopLogger },
                { provide: EnvironmentQuotaPolicy, useValue: new EnvironmentQuotaPolicy(5, 50) },
                AgentTokenServiceProvider,
                HostTokenServiceProvider,
                HostProviderGatewayProvider,
                EnvironmentProviderGatewayProvider,
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();

        dataSource = app.get(DataSource);
        projectRepository = app.get(ProjectRepository);
        environmentRepository = app.get(EnvironmentRepository);
        cloudAccountRepository = app.get(CloudAccountRepository);
        poolHostRepository = app.get(PoolHostRepository);
    });

    afterEach(async () => {
        delete process.env.POOL_HOST_SLOTS;
        await app.close();
    });

    type Seeded = { projectId: string; cloudAccountId: string };

    const seedProjectWithLocalEmulatorBinding = async (): Promise<Seeded> => {
        const externalId = UserFactory.createId();
        const project = await projectRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });
        await projectRepository.save(project);

        const cloudAccount = CloudAccount.create({
            projectId: ProjectId.fromString(project.id),
            type: "local",
        });
        cloudAccount.bindCompute({
            platformName: "android",
            execution: Execution.Emulator,
            kind: "baremetal",
            config: {},
        });
        await cloudAccountRepository.save(cloudAccount);

        return { projectId: project.id, cloudAccountId: cloudAccount.id };
    };

    const createEnvironment = async (seeded: Seeded): Promise<string> => {
        const environment = await environmentRepository.create({
            projectId: ProjectId.fromString(seeded.projectId),
            cloudAccountId: CloudAccountId.fromString(seeded.cloudAccountId),
            cloudType: "local",
            computeKind: "baremetal",
            platform: Platform.fromObject({ name: "android", version: "34" }),
            execution: Execution.Emulator,
            applications: ApplicationList.fromObject([{ name: "chrome", version: "latest" }]),
        });

        return environment.id;
    };

    const prepareNext = (): Promise<unknown> => app.get(PrepareNextEnvironmentUseCase).execute();

    test("seats environments on the operator's machine with no cloud and no ownership marker at all", async () => {
        const seeded = await seedProjectWithLocalEmulatorBinding();
        const first = await createEnvironment(seeded);
        const second = await createEnvironment(seeded);

        await prepareNext();
        await prepareNext();

        // Ownership passed without any label anywhere — the operator's own machine has nothing to prove.
        const firstEnvironment = await environmentRepository.get(EnvironmentId.fromString(first));
        expect(firstEnvironment.state).toBe(EnvironmentState.Preparing);

        const host = await poolHostRepository.findByEnvironment(EnvironmentId.fromString(first));
        expect(host?.state).toBe(PoolHostState.Ordering);
        expect(host?.placements()).toHaveLength(2);
        expect(host?.placementFor(second)?.slotIndex).toBe(1);
        expect(host?.placementFor(first)?.launch).toEqual({
            avd: "sw-android-34",
            internalUrl: expect.stringContaining("http://"),
        });

        // The row carries its provider route from birth — return and sweep never need the binding.
        const [row] = await dataSource.query(
            "SELECT provider_context FROM pool_host WHERE id = $1",
            [host?.id],
        ) as Array<{ provider_context: Record<string, unknown> }>;
        expect(row.provider_context).toEqual({ cloud: "local" });
    });

    test("the operator's agent registers the machine and receives the desired seats", async () => {
        const seeded = await seedProjectWithLocalEmulatorBinding();
        const envId = await createEnvironment(seeded);
        await prepareNext();

        const host = await poolHostRepository.findByEnvironment(EnvironmentId.fromString(envId));
        const registered = await app.get(RecordHostHeartbeatUseCase).execute({
            hostId: PoolHostId.fromString(host?.id ?? ""),
            hostIp: "127.0.0.1",
        });

        expect(registered.state).toBe(PoolHostState.Ready);
        expect(registered.placements().map((placement) => placement.environmentId)).toEqual([envId]);
    });

    test("an idle machine is forgotten without any cloud call — the machine itself stays the operator's", async () => {
        const seeded = await seedProjectWithLocalEmulatorBinding();
        const envId = await createEnvironment(seeded);
        await prepareNext();

        const host = await poolHostRepository.findByEnvironment(EnvironmentId.fromString(envId));

        // The environment dies; its seat frees; the machine stays empty past the idle TTL.
        const deleting = await environmentRepository.get(EnvironmentId.fromString(envId));
        deleting.startDeletion();
        await environmentRepository.save(deleting);
        await app.get(DeprovisionDeletingEnvironmentsUseCase).execute();
        await dataSource.query(
            "UPDATE pool_host SET last_emptied_at = now() - interval '10 minutes', state = 'ready' WHERE id = $1",
            [host?.id],
        );

        await app.get(ReconcileHostPoolUseCase).execute({
            idleTtlMs: 60_000,
            silenceAllowanceMs: 3_600_000,
            orderingTimeoutMs: 3_600_000,
        });

        const rows = await dataSource.query("SELECT id FROM pool_host WHERE id = $1", [host?.id]) as Array<unknown>;
        expect(rows).toHaveLength(0);
    });
});
