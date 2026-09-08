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
    DeprovisionDeletingEnvironmentsUseCase,
} from "../../../../../../../src/application/use-cases/environments/deprovision-deleting-environments-use-case";
import {
    PrepareNextEnvironmentUseCase,
} from "../../../../../../../src/application/use-cases/environments/prepare-next-environment-use-case";
import {
    PlaceWorkloadUseCase,
} from "../../../../../../../src/application/use-cases/machine-pool/place-workload-use-case";
import {
    ReleaseWorkloadUseCase,
} from "../../../../../../../src/application/use-cases/machine-pool/release-workload-use-case";
import { DiscardMachineUseCase } from "../../../../../../../src/application/use-cases/machines/discard-machine-use-case";
import { EnlistMachineUseCase } from "../../../../../../../src/application/use-cases/machines/enlist-machine-use-case";
import { CloudAccount } from "../../../../../../../src/domain/entities/cloud-account/cloud-account";
import { CloudAccountId } from "../../../../../../../src/domain/entities/cloud-account/cloud-account-id";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { EnvironmentId } from "../../../../../../../src/domain/entities/environment/environment-id";
import {
    EnvironmentQuotaPolicy,
} from "../../../../../../../src/domain/entities/environment/environment-quota";
import { EnvironmentState } from "../../../../../../../src/domain/entities/environment/environment-state";
import {
    EnvironmentStateReason,
} from "../../../../../../../src/domain/entities/environment/environment-state-reason";
import { Execution } from "../../../../../../../src/domain/entities/environment/execution";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { MachineLeaseState } from "../../../../../../../src/domain/entities/machine-pool/machine-lease-state";
import { ProjectId } from "../../../../../../../src/domain/entities/project/project-id";
import { User } from "../../../../../../../src/domain/entities/user/user";
import { OwnershipMarker } from "../../../../../../../src/domain/entities/verification/ownership-marker";
import {
    AgentTokenServiceProvider,
} from "../../../../../../../src/infrastructure/agent-token/agent-token-service-provider";
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
    EnvironmentProviderGatewayProvider,
} from "../../../../../../../src/infrastructure/gateways/environment-provider/environment-provider-gateway-provider";
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
const noopLogger = { log: (): void => undefined, warn: (): void => undefined, error: (): void => undefined };

// The whole baremetal provision path — worker use case → routing gateway → machine-pool bridge → pool
// use cases → real Postgres — with only the outermost `yc baremetal` client wrapper mocked (the one
// mock the policy allows). This is what proves the slicing: environments pack onto one machine.
describe("machine-pool assignment (baremetal route)", () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let projectRepository: ProjectRepository;
    let environmentRepository: EnvironmentRepository;
    let cloudAccountRepository: CloudAccountRepository;
    let machineLeaseRepository: MachineLeaseRepository;

    let createServer: jest.Mock;
    let deleteServer: jest.Mock;
    let folderLabels: jest.Mock;

    beforeEach(async () => {
        // Two seats per machine keep the packing arithmetic visible; the machine budget derives from
        // the binding's environment quota (maxEnvironments: 2 → ceil(2/2) = 1 machine).
        process.env.MACHINE_POOL_SLOTS_PER_MACHINE = "2";
        process.env.COMPUTE_BAREMETAL_INTERNAL_URL = "http://cp:3002";

        createServer = jest.fn(async (): Promise<void> => undefined);
        deleteServer = jest.fn(async (): Promise<void> => undefined);
        folderLabels = jest.fn(async (): Promise<Record<string, string>> => ({}));

        const client = {
            createServer,
            deleteServer,
            folderLabels,
            checkAccess: async (): Promise<{ reachable: boolean }> => ({ reachable: true }),
        } as unknown as YandexBaremetalClient;

        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ envFilePath: [".env", `env/.env.${process.env.NODE_ENV || "development"}`] }),
                PostgresModule,
            ],
            providers: [
                PrepareNextEnvironmentUseCase,
                DeprovisionDeletingEnvironmentsUseCase,
                PlaceWorkloadUseCase,
                ReleaseWorkloadUseCase,
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
                { provide: EnvironmentQuotaPolicy, useValue: new EnvironmentQuotaPolicy(5, 50) },
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
                AgentTokenServiceProvider,
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
        delete process.env.COMPUTE_BAREMETAL_INTERNAL_URL;
        await app.close();
    });

    type Seeded = { projectId: string; cloudAccountId: string };

    const seedProjectWithBaremetalBinding = async (): Promise<Seeded> => {
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
        cloudAccount.bindCompute({
            platformName: "android",
            execution: Execution.Emulator,
            kind: "baremetal",
            config: { folderId, maxEnvironments: 2 },
        });
        await cloudAccountRepository.save(cloudAccount);

        // The folder carries this project's ownership marker — the fail-safe gate reads it at provision.
        folderLabels.mockResolvedValue({ [OwnershipMarker.forProject(project.id).value()]: "1" });

        return { projectId: project.id, cloudAccountId: cloudAccount.id };
    };

    const createEnvironment = async (seeded: Seeded): Promise<string> => {
        const environment = await environmentRepository.create({
            projectId: ProjectId.fromString(seeded.projectId),
            cloudAccountId: CloudAccountId.fromString(seeded.cloudAccountId),
            cloudType: "yandex-cloud",
            computeKind: "baremetal",
            platform: Platform.fromObject({ name: "android", version: "14", deviceModel: "pixel-7" }),
            execution: Execution.Emulator,
            applications: ApplicationList.fromObject([{ nameAlias: "chrome" }]),
        });

        return environment.id;
    };

    const prepareNext = (): Promise<unknown> => app.get(PrepareNextEnvironmentUseCase).execute();

    const environmentState = async (id: string): Promise<{ state: string; stateReason: string | null }> => {
        const environment = await environmentRepository.get(EnvironmentId.fromString(id));

        return { state: environment.state, stateReason: environment.stateReason };
    };

    const assignments = async (): Promise<Array<{ environment_id: string; slot_index: number }>> =>
        dataSource.query("SELECT environment_id, slot_index FROM slot_assignment ORDER BY slot_index");

    test("the first environment orders a machine and takes seat 0 while it boots", async () => {
        const seeded = await seedProjectWithBaremetalBinding();
        const envId = await createEnvironment(seeded);

        await prepareNext();

        expect(await environmentState(envId)).toEqual({ state: EnvironmentState.Preparing, stateReason: null });
        expect(createServer).toHaveBeenCalledTimes(1);

        const order = createServer.mock.calls[0][0];
        expect(order.folderId).toBe(folderId);
        expect(order.configurationId).toBe("test-configuration");
        expect(order.name).toMatch(/^sw-lease-/);
        expect(order.labels["sw-lease-id"]).toBeDefined();
        expect(order.userData).toContain("SW_MACHINE_ID=");
        expect(order.userData).toContain("SW_REGISTRATION_TOKEN=");

        const lease = await machineLeaseRepository.findByEnvironment(EnvironmentId.fromString(envId));
        expect(lease?.state).toBe(MachineLeaseState.Ordering);
        expect(lease?.assignmentFor(envId)?.slotIndex).toBe(0);
        expect(lease?.assignmentFor(envId)?.launch).toEqual({
            avd: "sw-android-14",
            device: "pixel-7",
            internalUrl: "http://cp:3002",
            sessionTimeoutSeconds: 300,
            apps: [{ name: "chrome", app: false, webdriver: false }],
        });
    });

    // The slot pulls every delivered application through the control plane by the WORD it was asked
    // by (the detected identity does not exist yet at provision time), preinstalled ones stay out.
    test("the launch names delivered applications by their word, flagging a paired webdriver", async () => {
        const seeded = await seedProjectWithBaremetalBinding();
        const environment = await environmentRepository.create({
            projectId: ProjectId.fromString(seeded.projectId),
            cloudAccountId: CloudAccountId.fromString(seeded.cloudAccountId),
            cloudType: "yandex-cloud",
            computeKind: "baremetal",
            platform: Platform.fromObject({ name: "android", version: "14", deviceModel: "pixel-7" }),
            execution: Execution.Emulator,
            applications: ApplicationList.fromObject([
                { nameAlias: "settings", versionAlias: "14", source: { type: "provided" } },
                { nameAlias: "chrome", versionAlias: "152", source: { type: "provided", webdriverRef: "https://store/driver.zip" } },
                {
                    nameAlias: "myapp",
                    versionAlias: "e2e-1",
                    source: { type: "custom", appRef: "builds/myapp.apk", webdriverRef: "builds/driver" },
                },
            ]),
        });

        await prepareNext();

        const lease = await machineLeaseRepository.findByEnvironment(EnvironmentId.fromString(environment.id));
        const launch = lease?.assignmentFor(environment.id)?.launch as { apps: Array<{ name: string }> };
        // Storage returns the applications in no particular order.
        expect([...launch.apps].sort((left, right) => left.name.localeCompare(right.name))).toEqual([
            { name: "chrome", app: false, webdriver: true },
            { name: "myapp", app: true, webdriver: true },
            { name: "settings", app: false, webdriver: false },
        ]);
    });

    test("the second environment packs onto the same machine — no second order", async () => {
        const seeded = await seedProjectWithBaremetalBinding();
        const first = await createEnvironment(seeded);
        const second = await createEnvironment(seeded);

        await prepareNext();
        await prepareNext();

        expect(createServer).toHaveBeenCalledTimes(1);

        const hostOfFirst = await machineLeaseRepository.findByEnvironment(EnvironmentId.fromString(first));
        const hostOfSecond = await machineLeaseRepository.findByEnvironment(EnvironmentId.fromString(second));
        expect(hostOfFirst?.id).toBe(hostOfSecond?.id);
        expect((await assignments()).map((row) => row.slot_index)).toEqual([0, 1]);
    });

    test("deleting an environment frees its seat, and the next environment reuses it", async () => {
        const seeded = await seedProjectWithBaremetalBinding();
        const first = await createEnvironment(seeded);
        const second = await createEnvironment(seeded);
        await prepareNext();
        await prepareNext();

        const deleting = await environmentRepository.get(EnvironmentId.fromString(first));
        deleting.startDeletion();
        await environmentRepository.save(deleting);
        await app.get(DeprovisionDeletingEnvironmentsUseCase).execute();

        expect((await assignments()).map((row) => row.environment_id)).toEqual([second]);

        const third = await createEnvironment(seeded);
        await prepareNext();

        const hostOfThird = await machineLeaseRepository.findByEnvironment(EnvironmentId.fromString(third));
        expect(hostOfThird?.assignmentFor(third)?.slotIndex).toBe(0);
        expect(createServer).toHaveBeenCalledTimes(1);
    });

    test("a full pool at its machine cap fails the environment instead of leasing beyond the budget", async () => {
        const seeded = await seedProjectWithBaremetalBinding();
        await createEnvironment(seeded);
        await createEnvironment(seeded);
        const overflow = await createEnvironment(seeded);

        await prepareNext();
        await prepareNext();
        await prepareNext();

        expect(await environmentState(overflow)).toEqual({
            state: EnvironmentState.Failed,
            stateReason: EnvironmentStateReason.ProviderError,
        });
        expect(createServer).toHaveBeenCalledTimes(1);
    });

    // The per-pool advisory lock is what makes this deterministic: the placers run truly in parallel
    // (each claims its own environment via SKIP LOCKED), and without the lock both could find no free
    // seat and each lease a machine where one had room for both.
    test("concurrent provisioning never leases a second machine when one has room", async () => {
        const seeded = await seedProjectWithBaremetalBinding();
        await createEnvironment(seeded);
        await createEnvironment(seeded);

        await Promise.all([prepareNext(), prepareNext()]);

        expect(createServer).toHaveBeenCalledTimes(1);
        expect((await assignments()).map((row) => row.slot_index).sort()).toEqual([0, 1]);
    });

    test("a provisioning retry keeps its existing seat (idempotent assignment)", async () => {
        const seeded = await seedProjectWithBaremetalBinding();
        const envId = await createEnvironment(seeded);
        await prepareNext();

        // The reaper sends a stuck environment back to the queue; the retry must land on the same seat.
        const stuck = await environmentRepository.get(EnvironmentId.fromString(envId));
        stuck.retryProvisioning();
        await environmentRepository.save(stuck);
        await prepareNext();

        expect(createServer).toHaveBeenCalledTimes(1);
        expect((await assignments()).map((row) => row.slot_index)).toEqual([0]);
        expect(await environmentState(envId)).toEqual({ state: EnvironmentState.Preparing, stateReason: null });
    });

    test("a folder without the project's marker is refused before any machine is leased", async () => {
        const seeded = await seedProjectWithBaremetalBinding();
        folderLabels.mockResolvedValue({});
        const envId = await createEnvironment(seeded);

        await prepareNext();

        expect(await environmentState(envId)).toEqual({
            state: EnvironmentState.Failed,
            stateReason: EnvironmentStateReason.OwnershipNotVerified,
        });
        expect(createServer).not.toHaveBeenCalled();
    });
});
