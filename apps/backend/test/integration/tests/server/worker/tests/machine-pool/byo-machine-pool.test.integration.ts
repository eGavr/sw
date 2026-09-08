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
    MachineLeaseRepository,
} from "../../../../../../../src/application/interfaces/repositories/machine-lease-repository";
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
} from "../../../../../../../src/application/use-cases/machine-pool/place-workload-use-case";
import {
    ReconcileMachinePoolUseCase,
} from "../../../../../../../src/application/use-cases/machine-pool/reconcile-machine-pool-use-case";
import {
    RecordLeaseHeartbeatUseCase,
} from "../../../../../../../src/application/use-cases/machine-pool/record-lease-heartbeat-use-case";
import {
    ReleaseWorkloadUseCase,
} from "../../../../../../../src/application/use-cases/machine-pool/release-workload-use-case";
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
import { MachineLeaseId } from "../../../../../../../src/domain/entities/machine-pool/machine-lease-id";
import { MachineLeaseState } from "../../../../../../../src/domain/entities/machine-pool/machine-lease-state";
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
    MachineLeaseDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/machine-lease-data-source";
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
    MachineProviderGatewayProvider,
} from "../../../../../../../src/infrastructure/gateways/machine-provider/machine-provider-gateway-provider";
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
import { UserFactory } from "../../../utils/entities/user/user-factory";

const noopLogger = { log: (): void => undefined, warn: (): void => undefined, error: (): void => undefined };

// The local baremetal route end to end with NOTHING mocked: the byo host provider's only external
// system is the operator (a log line), so the whole vertical — routing, bridge, pool, ownership —
// runs for real against Postgres. This is the CP half of "my Mac is the machine".
describe("machine-pool assignment (local byo route)", () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let projectRepository: ProjectRepository;
    let environmentRepository: EnvironmentRepository;
    let cloudAccountRepository: CloudAccountRepository;
    let machineLeaseRepository: MachineLeaseRepository;

    beforeEach(async () => {
        process.env.MACHINE_POOL_SLOTS_PER_MACHINE = "2";

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
                ReconcileMachinePoolUseCase,
                RecordLeaseHeartbeatUseCase,
                ProjectDataSource,
                EnvironmentDataSource,
                CloudAccountDataSource,
                MachineLeaseDataSource,
                { provide: ProjectRepository, useClass: ProjectRepositoryImpl },
                { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
                { provide: CloudAccountRepository, useClass: CloudAccountRepositoryImpl },
                { provide: MachineLeaseRepository, useClass: MachineLeaseRepositoryImpl },
                { provide: ApplicationLogger, useValue: noopLogger },
                { provide: EnvironmentQuotaPolicy, useValue: new EnvironmentQuotaPolicy(5, 50) },
                AgentTokenServiceProvider,
                LeaseTokenServiceProvider,
                MachineProviderGatewayProvider,
                EnvironmentProviderGatewayProvider,
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();

        dataSource = app.get(DataSource);
        projectRepository = app.get(ProjectRepository);
        environmentRepository = app.get(EnvironmentRepository);
        cloudAccountRepository = app.get(CloudAccountRepository);
        machineLeaseRepository = app.get(MachineLeaseRepository);
    });

    afterEach(async () => {
        delete process.env.MACHINE_POOL_SLOTS_PER_MACHINE;
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
            platform: Platform.fromObject({ name: "android", version: "14", deviceModel: "pixel-7" }),
            execution: Execution.Emulator,
            applications: ApplicationList.fromObject([{ nameAlias: "chrome" }]),
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

        const lease = await machineLeaseRepository.findByEnvironment(EnvironmentId.fromString(first));
        expect(lease?.state).toBe(MachineLeaseState.Ordering);
        expect(lease?.assignments()).toHaveLength(2);
        expect(lease?.assignmentFor(second)?.slotIndex).toBe(1);
        expect(lease?.assignmentFor(first)?.launch).toEqual({
            avd: "sw-android-14",
            device: "pixel-7",
            internalUrl: expect.stringContaining("http://"),
            sessionTimeoutSeconds: 300,
            apps: [{ name: "chrome", app: false, webdriver: false }],
        });

        // The row carries its provider route from birth — return and sweep never need the binding.
        const [row] = await dataSource.query(
            "SELECT provider_context FROM machine_lease WHERE id = $1",
            [lease?.id],
        ) as Array<{ provider_context: Record<string, unknown> }>;
        expect(row.provider_context).toEqual({ cloud: "local" });
    });

    test("the operator's agent registers the machine and receives the desired seats", async () => {
        const seeded = await seedProjectWithLocalEmulatorBinding();
        const envId = await createEnvironment(seeded);
        await prepareNext();

        const lease = await machineLeaseRepository.findByEnvironment(EnvironmentId.fromString(envId));
        const registered = await app.get(RecordLeaseHeartbeatUseCase).execute({
            leaseId: MachineLeaseId.fromString(lease?.id ?? ""),
            hostIp: "127.0.0.1",
        });

        expect(registered.state).toBe(MachineLeaseState.Ready);
        expect(registered.assignments().map((assignment) => assignment.environmentId)).toEqual([envId]);
    });

    test("an idle machine is forgotten without any cloud call — the machine itself stays the operator's", async () => {
        const seeded = await seedProjectWithLocalEmulatorBinding();
        const envId = await createEnvironment(seeded);
        await prepareNext();

        const lease = await machineLeaseRepository.findByEnvironment(EnvironmentId.fromString(envId));

        // The environment dies; its seat frees; the machine stays empty past the idle TTL.
        const deleting = await environmentRepository.get(EnvironmentId.fromString(envId));
        deleting.startDeletion();
        await environmentRepository.save(deleting);
        await app.get(DeprovisionDeletingEnvironmentsUseCase).execute();
        await dataSource.query(
            "UPDATE machine_lease SET last_emptied_at = now() - interval '10 minutes', state = 'ready' WHERE id = $1",
            [lease?.id],
        );

        await app.get(ReconcileMachinePoolUseCase).execute({
            idleTtlMs: 60_000,
            silenceAllowanceMs: 3_600_000,
            orderingTimeoutMs: 3_600_000,
        });

        const rows = await dataSource.query("SELECT id FROM machine_lease WHERE id = $1", [lease?.id]) as Array<unknown>;
        expect(rows).toHaveLength(0);
    });
});
