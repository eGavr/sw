import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";

import {
    HostProviderGateway,
} from "../../../../../../../src/application/interfaces/gateways/host-provider-gateway";
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
    PlaceWorkloadUseCase,
} from "../../../../../../../src/application/use-cases/host-pool/place-workload-use-case";
import {
    ReconcileHostPoolUseCase,
} from "../../../../../../../src/application/use-cases/host-pool/reconcile-host-pool-use-case";
import { CloudAccount } from "../../../../../../../src/domain/entities/cloud-account/cloud-account";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { EnvironmentId } from "../../../../../../../src/domain/entities/environment/environment-id";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { HostPoolKey } from "../../../../../../../src/domain/entities/host-pool/host-pool-key";
import { PoolHost } from "../../../../../../../src/domain/entities/host-pool/pool-host";
import { PoolHostId } from "../../../../../../../src/domain/entities/host-pool/pool-host-id";
import { PoolHostState } from "../../../../../../../src/domain/entities/host-pool/pool-host-state";
import { ProjectId } from "../../../../../../../src/domain/entities/project/project-id";
import { User } from "../../../../../../../src/domain/entities/user/user";
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
    YandexBaremetalClient,
} from "../../../../../../../src/infrastructure/gateways/host-provider/yandex-baremetal/yandex-baremetal-client";
import {
    YandexBaremetalHostProvider,
} from "../../../../../../../src/infrastructure/gateways/host-provider/yandex-baremetal/yandex-baremetal-host-provider";
import {
    Hs256HostTokenService,
} from "../../../../../../../src/infrastructure/host-token/hs256-host-token-service";
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

const folderId = "b1gtestfolder0000000";
const sweepParams = { idleTtlMs: 60_000, silenceAllowanceMs: 60_000, orderingTimeoutMs: 60_000 };
const noopLogger = { log: (): void => undefined, warn: (): void => undefined, error: (): void => undefined };

// The pool's self-audit against a real Postgres, with only the `yc baremetal` client wrapper mocked:
// idle machines are returned, silent ones written off and returned once empty, never-arrived orders
// written off, and leases no row knows are swept — machines cost money by the hour.
describe("host-pool reconcile", () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let projectRepository: ProjectRepository;
    let environmentRepository: EnvironmentRepository;
    let cloudAccountRepository: CloudAccountRepository;
    let poolHostRepository: PoolHostRepository;

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
                ReconcileHostPoolUseCase,
                PlaceWorkloadUseCase,
                ProjectDataSource,
                EnvironmentDataSource,
                CloudAccountDataSource,
                PoolHostDataSource,
                { provide: ProjectRepository, useClass: ProjectRepositoryImpl },
                { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
                { provide: CloudAccountRepository, useClass: CloudAccountRepositoryImpl },
                { provide: PoolHostRepository, useClass: PoolHostRepositoryImpl },
                { provide: ApplicationLogger, useValue: noopLogger },
                {
                    provide: HostProviderGateway,
                    useValue: new YandexBaremetalHostProvider(
                        client,
                        { configurationId: "test-configuration", zone: "ru-central1-m", internalUrl: "http://cp:3002" },
                        new Hs256HostTokenService(new TextEncoder().encode("test-internal-secret"), 3600),
                    ),
                },
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
        await app.close();
    });

    const seedPool = async (): Promise<HostPoolKey> => {
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

        return new HostPoolKey(cloudAccount.id, project.id);
    };

    const seedEnvironmentId = async (poolKey: HostPoolKey): Promise<string> => {
        const projects = await dataSource.query(
            "SELECT project_id FROM cloud_account WHERE id = $1",
            [poolKey.cloudAccountId],
        ) as Array<{ project_id: string }>;
        const environment = await environmentRepository.create({
            projectId: ProjectId.fromString(projects[0].project_id),
            platform: Platform.fromObject({ name: "android", version: "14" }),
            applications: ApplicationList.fromObject([{ name: "chrome", version: "latest" }]),
        });

        return environment.id;
    };

    const seedHost = async (poolKey: HostPoolKey, providerContext = { folderId }): Promise<PoolHost> => {
        return poolHostRepository.create({ poolKey, capacitySlots: 2, providerContext });
    };

    const registerHost = (id: string, at: Date): Promise<PoolHost | null> =>
        poolHostRepository.with(PoolHostId.fromString(id), (host) => host.register("10.0.0.5", at));

    const age = (id: string, column: "last_emptied_at" | "last_seen_at" | "created_at", at: Date): Promise<unknown> =>
        dataSource.query(`UPDATE pool_host SET ${column} = $1 WHERE id = $2`, [at, id]);

    const reconcile = (): Promise<void> => app.get(ReconcileHostPoolUseCase).execute(sweepParams);

    const hostRow = async (id: string): Promise<{ state: string } | undefined> => {
        const rows = await dataSource.query("SELECT state FROM pool_host WHERE id = $1", [id]) as Array<{ state: string }>;

        return rows[0];
    };

    const past = (): Date => new Date(Date.now() - 120_000);

    test("returns an empty machine that stayed idle past the TTL — and forgets it", async () => {
        const poolKey = await seedPool();
        const host = await seedHost(poolKey);
        await registerHost(host.id, new Date());
        await age(host.id, "last_emptied_at", past());

        await reconcile();

        expect(deleteServer).toHaveBeenCalledWith(`sw-host-${host.id}`, folderId);
        expect(await hostRow(host.id)).toBeUndefined();
    });

    test("leaves a freshly emptied machine alone — lingering is the point", async () => {
        const poolKey = await seedPool();
        const host = await seedHost(poolKey);
        await registerHost(host.id, new Date());

        await reconcile();

        expect(deleteServer).not.toHaveBeenCalled();
        expect((await hostRow(host.id))?.state).toBe(PoolHostState.Ready);
    });

    test("writes off a silent machine but keeps it until its seats die on their own", async () => {
        const poolKey = await seedPool();
        const environmentId = await seedEnvironmentId(poolKey);
        const host = await seedHost(poolKey);
        await registerHost(host.id, past());
        await poolHostRepository.with(PoolHostId.fromString(host.id), (locked) => {
            locked.place(environmentId, {});
        });

        await reconcile();

        expect((await hostRow(host.id))?.state).toBe(PoolHostState.Failed);
        expect(deleteServer).not.toHaveBeenCalled();

        // The seat died (its environment was reaped) — the next tick returns the machine.
        await poolHostRepository.with(PoolHostId.fromString(host.id), (locked) => {
            locked.release(environmentId);
        });
        await reconcile();

        expect(deleteServer).toHaveBeenCalledWith(`sw-host-${host.id}`, folderId);
        expect(await hostRow(host.id)).toBeUndefined();
    });

    test("writes off and returns an order the agent never answered", async () => {
        const poolKey = await seedPool();
        const host = await seedHost(poolKey);
        await age(host.id, "created_at", past());

        await reconcile();

        expect(deleteServer).toHaveBeenCalledWith(`sw-host-${host.id}`, folderId);
        expect(await hostRow(host.id)).toBeUndefined();
    });

    test("sweeps a leased machine no pool row knows — a lost row must never mean a leaked lease", async () => {
        const poolKey = await seedPool();
        const host = await seedHost(poolKey);
        await registerHost(host.id, new Date());
        listServers.mockResolvedValue([
            { name: `sw-host-${host.id}`, labels: { "sw-host-id": host.id } },
            { name: "sw-host-orphan", labels: { "sw-host-id": "0rphan-id" } },
        ]);

        await reconcile();

        expect(deleteServer).toHaveBeenCalledWith("sw-host-0rphan-id", folderId);
        expect(await hostRow(host.id)).toBeDefined();
    });

    test("a retry whose seat sits on a written-off machine leaves the sinking ship", async () => {
        const poolKey = await seedPool();
        const environmentId = await seedEnvironmentId(poolKey);
        const doomed = await seedHost(poolKey);
        await registerHost(doomed.id, new Date());
        await poolHostRepository.with(PoolHostId.fromString(doomed.id), (locked) => {
            locked.place(environmentId, {});
            locked.markFailed();
        });

        await app.get(PlaceWorkloadUseCase).execute({
            environmentId: EnvironmentId.fromString(environmentId),
            poolKey,
            capacitySlots: 2,
            maxHosts: 2,
            providerContext: { folderId },
            launch: { avd: "sw-android-14" },
        });

        const rescued = await poolHostRepository.findByEnvironment(EnvironmentId.fromString(environmentId));
        expect(rescued).not.toBeNull();
        expect(rescued?.id).not.toBe(doomed.id);
        expect(createServer).toHaveBeenCalledTimes(1);
    });
});
