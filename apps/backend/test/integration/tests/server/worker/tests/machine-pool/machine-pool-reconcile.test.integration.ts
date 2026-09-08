import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";

import {
    MachineProviderGateway,
} from "../../../../../../../src/application/interfaces/gateways/machine-provider-gateway";
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
import { MachineRepository } from "../../../../../../../src/application/interfaces/repositories/machine-repository";
import {
    ProjectRepository,
} from "../../../../../../../src/application/interfaces/repositories/project-repository";
import {
    PlaceWorkloadUseCase,
} from "../../../../../../../src/application/use-cases/machine-pool/place-workload-use-case";
import {
    ReconcileMachinePoolUseCase,
} from "../../../../../../../src/application/use-cases/machine-pool/reconcile-machine-pool-use-case";
import { DiscardMachineUseCase } from "../../../../../../../src/application/use-cases/machines/discard-machine-use-case";
import { EnlistMachineUseCase } from "../../../../../../../src/application/use-cases/machines/enlist-machine-use-case";
import { CloudAccount } from "../../../../../../../src/domain/entities/cloud-account/cloud-account";
import { Stereotype } from "../../../../../../../src/domain/entities/cloud-account/stereotype";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { EnvironmentId } from "../../../../../../../src/domain/entities/environment/environment-id";
import { Execution } from "../../../../../../../src/domain/entities/environment/execution";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { MachineLease } from "../../../../../../../src/domain/entities/machine-pool/machine-lease";
import { MachineLeaseId } from "../../../../../../../src/domain/entities/machine-pool/machine-lease-id";
import { MachineLeaseState } from "../../../../../../../src/domain/entities/machine-pool/machine-lease-state";
import { MachinePoolKey } from "../../../../../../../src/domain/entities/machine-pool/machine-pool-key";
import { ProjectId } from "../../../../../../../src/domain/entities/project/project-id";
import { User } from "../../../../../../../src/domain/entities/user/user";
import {
    CloudAccountDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/cloud-account-data-source";
import {
    EnvironmentDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/environment-data-source";
import { MachineDataSource } from "../../../../../../../src/infrastructure/data-sources/database/postgres/machine-data-source";
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
    stampProviderContext,
} from "../../../../../../../src/infrastructure/gateways/machine-provider/machine-provider-context";
import {
    YandexBaremetalClient,
} from "../../../../../../../src/infrastructure/gateways/machine-provider/yandex-baremetal/yandex-baremetal-client";
import {
    YandexBaremetalMachineProvider,
} from "../../../../../../../src/infrastructure/gateways/machine-provider/yandex-baremetal/yandex-baremetal-machine-provider";
import {
    RegistrationTokenServiceProvider,
} from "../../../../../../../src/infrastructure/registration-token/registration-token-service-provider";
import {
    CloudAccountRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/cloud-account-repository-impl";
import {
    EnvironmentRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/environment-repository-impl";
import {
    MachineLeaseRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/machine-lease-repository-impl";
import { MachineRepositoryImpl } from "../../../../../../../src/infrastructure/repositories/machine-repository-impl";
import {
    ProjectRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/project-repository-impl";
import { UserFactory } from "../../../utils/entities/user/user-factory";

const folderId = "b1gtestfolder0000000";
const sweepParams = { idleTtlMs: 60_000, silenceAllowanceMs: 60_000, orderingTimeoutMs: 60_000 };
const noopLogger = { log: (): void => undefined, warn: (): void => undefined, error: (): void => undefined };

// The pool's self-audit against a real Postgres, with only the `yc baremetal` client wrapper mocked:
// idle machines are returned, silent ones written off and returned once empty, never-arrived orders
// written off, and leases no row knows are swept — machines cost money by the hour.
describe("machine-pool reconcile", () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let projectRepository: ProjectRepository;
    let environmentRepository: EnvironmentRepository;
    let cloudAccountRepository: CloudAccountRepository;
    let machineLeaseRepository: MachineLeaseRepository;

    let createServer: jest.Mock;
    let deleteServer: jest.Mock;
    let listServers: jest.Mock;

    beforeEach(async () => {
        createServer = jest.fn(async (): Promise<void> => undefined);
        deleteServer = jest.fn(async (): Promise<void> => undefined);
        listServers = jest.fn(async (): Promise<Array<{ name: string; labels?: Record<string, string> }>> => []);

        const client = {
            createServer,
            deleteServer,
            listServers,
            folderLabels: async (): Promise<Record<string, string>> => ({}),
            checkAccess: async (): Promise<{ reachable: boolean }> => ({ reachable: true }),
        } as unknown as YandexBaremetalClient;

        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ envFilePath: [".env", `env/.env.${process.env.NODE_ENV || "development"}`] }),
                PostgresModule,
            ],
            providers: [
                ReconcileMachinePoolUseCase,
                PlaceWorkloadUseCase,
                ProjectDataSource,
                EnvironmentDataSource,
                CloudAccountDataSource,
                MachineLeaseDataSource,
                { provide: ProjectRepository, useClass: ProjectRepositoryImpl },
                { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
                { provide: CloudAccountRepository, useClass: CloudAccountRepositoryImpl },
                { provide: MachineLeaseRepository, useClass: MachineLeaseRepositoryImpl },
                { provide: MachineRepository, useClass: MachineRepositoryImpl },
                MachineDataSource,
                RegistrationTokenServiceProvider,
                EnlistMachineUseCase,
                DiscardMachineUseCase,
                { provide: ApplicationLogger, useValue: noopLogger },
                {
                    provide: MachineProviderGateway,
                    useFactory: (enlist: EnlistMachineUseCase, discard: DiscardMachineUseCase): MachineProviderGateway =>
                        new YandexBaremetalMachineProvider(
                            client,
                            {
                                configurationId: "test-configuration",
                                zone: "ru-central1-m",
                                internalUrl: "http://cp:3002",
                                slotsPerMachine: 2,
                            },
                            enlist,
                            discard,
                        ),
                    inject: [EnlistMachineUseCase, DiscardMachineUseCase],
                },
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
        await app.close();
    });

    const seedPool = async (): Promise<MachinePoolKey> => {
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

        return new MachinePoolKey(cloudAccount.id, project.id);
    };

    const seedEnvironmentId = async (poolKey: MachinePoolKey): Promise<string> => {
        const projects = await dataSource.query(
            "SELECT project_id FROM cloud_account WHERE id = $1",
            [poolKey.cloudAccountId],
        ) as Array<{ project_id: string }>;
        const environment = await environmentRepository.create({
            projectId: ProjectId.fromString(projects[0].project_id),
            platform: Platform.fromObject({ name: "android", version: "14", deviceModel: "pixel-7" }),
            applications: ApplicationList.fromObject([{ nameAlias: "chrome" }]),
        });

        return environment.id;
    };

    // A lease's whereabouts as the bridge stamps them: the folder, the cloud, the account, the stereotype.
    const contextOf = (poolKey: MachinePoolKey): Record<string, unknown> => stampProviderContext(
        { folderId },
        { type: "yandex-cloud", id: poolKey.cloudAccountId },
        new Stereotype("android", Execution.Emulator),
    );

    const seedHost = async (poolKey: MachinePoolKey, providerContext = contextOf(poolKey)): Promise<MachineLease> => {
        return machineLeaseRepository.create({ poolKey, slotCapacity: 2, providerContext });
    };

    const registerHost = (id: string, at: Date): Promise<MachineLease | null> =>
        machineLeaseRepository.with(MachineLeaseId.fromString(id), (lease) => lease.register("10.0.0.5", at));

    const age = (id: string, column: "last_emptied_at" | "last_seen_at" | "created_at", at: Date): Promise<unknown> =>
        dataSource.query(`UPDATE machine_lease SET ${column} = $1 WHERE id = $2`, [at, id]);

    const reconcile = (): Promise<void> => app.get(ReconcileMachinePoolUseCase).execute(sweepParams);

    const hostRow = async (id: string): Promise<{ state: string } | undefined> => {
        const rows = await dataSource.query("SELECT state FROM machine_lease WHERE id = $1", [id]) as Array<{ state: string }>;

        return rows[0];
    };

    const past = (): Date => new Date(Date.now() - 120_000);

    test("returns an empty machine that stayed idle past the TTL — and forgets it", async () => {
        const poolKey = await seedPool();
        const lease = await seedHost(poolKey);
        await registerHost(lease.id, new Date());
        await age(lease.id, "last_emptied_at", past());

        await reconcile();

        expect(deleteServer).toHaveBeenCalledWith(`sw-lease-${lease.id}`, folderId);
        expect(await hostRow(lease.id)).toBeUndefined();
    });

    test("leaves a freshly emptied machine alone — lingering is the point", async () => {
        const poolKey = await seedPool();
        const lease = await seedHost(poolKey);
        await registerHost(lease.id, new Date());

        await reconcile();

        expect(deleteServer).not.toHaveBeenCalled();
        expect((await hostRow(lease.id))?.state).toBe(MachineLeaseState.Ready);
    });

    test("writes off a silent machine but keeps it until its seats die on their own", async () => {
        const poolKey = await seedPool();
        const environmentId = await seedEnvironmentId(poolKey);
        const lease = await seedHost(poolKey);
        await registerHost(lease.id, past());
        await machineLeaseRepository.with(MachineLeaseId.fromString(lease.id), (locked) => {
            locked.place(environmentId, {});
        });

        await reconcile();

        expect((await hostRow(lease.id))?.state).toBe(MachineLeaseState.Failed);
        expect(deleteServer).not.toHaveBeenCalled();

        // The seat died (its environment was reaped) — the next tick returns the machine.
        await machineLeaseRepository.with(MachineLeaseId.fromString(lease.id), (locked) => {
            locked.release(environmentId);
        });
        await reconcile();

        expect(deleteServer).toHaveBeenCalledWith(`sw-lease-${lease.id}`, folderId);
        expect(await hostRow(lease.id)).toBeUndefined();
    });

    test("writes off and returns an order the agent never answered", async () => {
        const poolKey = await seedPool();
        const lease = await seedHost(poolKey);
        await age(lease.id, "created_at", past());

        await reconcile();

        expect(deleteServer).toHaveBeenCalledWith(`sw-lease-${lease.id}`, folderId);
        expect(await hostRow(lease.id)).toBeUndefined();
    });

    test("sweeps a leased machine no pool row knows — a lost row must never mean a leaked lease", async () => {
        const poolKey = await seedPool();
        const lease = await seedHost(poolKey);
        await registerHost(lease.id, new Date());
        listServers.mockResolvedValue([
            { name: `sw-lease-${lease.id}`, labels: { "sw-lease-id": lease.id } },
            { name: "sw-lease-orphan", labels: { "sw-lease-id": "0rphan-id" } },
        ]);

        await reconcile();

        expect(deleteServer).toHaveBeenCalledWith("sw-lease-0rphan-id", folderId);
        expect(await hostRow(lease.id)).toBeDefined();
    });

    test("a retry whose seat sits on a written-off machine leaves the sinking ship", async () => {
        const poolKey = await seedPool();
        const environmentId = await seedEnvironmentId(poolKey);
        const doomed = await seedHost(poolKey);
        await registerHost(doomed.id, new Date());
        await machineLeaseRepository.with(MachineLeaseId.fromString(doomed.id), (locked) => {
            locked.place(environmentId, {});
            locked.markFailed();
        });

        await app.get(PlaceWorkloadUseCase).execute({
            environmentId: EnvironmentId.fromString(environmentId),
            poolKey,
            slotCapacity: 2,
            maxLeases: 2,
            providerContext: contextOf(poolKey),
            launch: { avd: "sw-android-14" },
        });

        const rescued = await machineLeaseRepository.findByEnvironment(EnvironmentId.fromString(environmentId));
        expect(rescued).not.toBeNull();
        expect(rescued?.id).not.toBe(doomed.id);
        expect(createServer).toHaveBeenCalledTimes(1);
    });
});
