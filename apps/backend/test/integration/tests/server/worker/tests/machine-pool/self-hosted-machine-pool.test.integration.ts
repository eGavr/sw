import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";

import { MachinePoolGateway } from "../../../../../../../src/application/interfaces/gateways/machine-pool-gateway";
import { MachineProviderGateway } from "../../../../../../../src/application/interfaces/gateways/machine-provider-gateway";
import { Logger as ApplicationLogger } from "../../../../../../../src/application/interfaces/logger";
import {
    CloudAccountRepository,
} from "../../../../../../../src/application/interfaces/repositories/cloud-account-repository";
import { EnvironmentRepository } from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import {
    MachineLeaseRepository,
} from "../../../../../../../src/application/interfaces/repositories/machine-lease-repository";
import { MachineRepository } from "../../../../../../../src/application/interfaces/repositories/machine-repository";
import { ProjectRepository } from "../../../../../../../src/application/interfaces/repositories/project-repository";
import {
    DeprovisionDeletingEnvironmentsUseCase,
} from "../../../../../../../src/application/use-cases/environments/deprovision-deleting-environments-use-case";
import {
    PrepareNextEnvironmentUseCase,
} from "../../../../../../../src/application/use-cases/environments/prepare-next-environment-use-case";
import { GetMachineLeaseUseCase } from "../../../../../../../src/application/use-cases/machine-pool/get-machine-lease-use-case";
import { PlaceWorkloadUseCase } from "../../../../../../../src/application/use-cases/machine-pool/place-workload-use-case";
import {
    RecordLeaseHeartbeatUseCase,
} from "../../../../../../../src/application/use-cases/machine-pool/record-lease-heartbeat-use-case";
import { ReleaseWorkloadUseCase } from "../../../../../../../src/application/use-cases/machine-pool/release-workload-use-case";
import { ClaimMachineUseCase } from "../../../../../../../src/application/use-cases/machines/claim-machine-use-case";
import { DiscardMachineUseCase } from "../../../../../../../src/application/use-cases/machines/discard-machine-use-case";
import { EnlistMachineUseCase } from "../../../../../../../src/application/use-cases/machines/enlist-machine-use-case";
import {
    ListMachineLeaseIdsUseCase,
} from "../../../../../../../src/application/use-cases/machines/list-machine-lease-ids-use-case";
import { MeasureHeadroomUseCase } from "../../../../../../../src/application/use-cases/machines/measure-headroom-use-case";
import { ReleaseMachineUseCase } from "../../../../../../../src/application/use-cases/machines/release-machine-use-case";
import { SyncMachineUseCase } from "../../../../../../../src/application/use-cases/machines/sync-machine-use-case";
import { CloudAccount } from "../../../../../../../src/domain/entities/cloud-account/cloud-account";
import { CloudAccountId } from "../../../../../../../src/domain/entities/cloud-account/cloud-account-id";
import { Stereotype } from "../../../../../../../src/domain/entities/cloud-account/stereotype";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { EnvironmentId } from "../../../../../../../src/domain/entities/environment/environment-id";
import { EnvironmentQuotaPolicy } from "../../../../../../../src/domain/entities/environment/environment-quota";
import { EnvironmentState } from "../../../../../../../src/domain/entities/environment/environment-state";
import { Execution } from "../../../../../../../src/domain/entities/environment/execution";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { Machine } from "../../../../../../../src/domain/entities/machine/machine";
import { MachineFacts } from "../../../../../../../src/domain/entities/machine/machine-facts";
import { MachineId } from "../../../../../../../src/domain/entities/machine/machine-id";
import { MachineOrigin } from "../../../../../../../src/domain/entities/machine/machine-origin";
import { selfHostedCloudType } from "../../../../../../../src/domain/entities/machine/self-hosted-cloud-type";
import { SlotCapacityPolicy } from "../../../../../../../src/domain/entities/machine/slot-capacity-policy";
import { MachineLeaseState } from "../../../../../../../src/domain/entities/machine-pool/machine-lease-state";
import { ProjectId } from "../../../../../../../src/domain/entities/project/project-id";
import { User } from "../../../../../../../src/domain/entities/user/user";
import { AgentTokenServiceProvider } from "../../../../../../../src/infrastructure/agent-token/agent-token-service-provider";
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
import { ProjectDataSource } from "../../../../../../../src/infrastructure/data-sources/database/postgres/project-data-source";
import { PostgresModule } from "../../../../../../../src/infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import {
    EnvironmentProviderGatewayProvider,
} from "../../../../../../../src/infrastructure/gateways/environment-provider/environment-provider-gateway-provider";
import {
    InProcessMachinePoolGateway,
} from "../../../../../../../src/infrastructure/gateways/machine-pool/in-process-machine-pool-gateway";
import {
    MachineProviderGatewayProvider,
} from "../../../../../../../src/infrastructure/gateways/machine-provider/machine-provider-gateway-provider";
import { SlotCapacityPolicyProvider } from "../../../../../../../src/infrastructure/machines/slot-capacity-policy-provider";
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
import { ProjectRepositoryImpl } from "../../../../../../../src/infrastructure/repositories/project-repository-impl";
import { UserFactory } from "../../../utils/entities/user/user-factory";

const noopLogger = { log: (): void => undefined, warn: (): void => undefined, error: (): void => undefined };
const androidEmulator = new Stereotype("android", Execution.Emulator);
const policy = new SlotCapacityPolicy(4, 16);

// The self-hosted cloud under the pool: the worker's provision takes a free attached machine for the
// lease, the machine's sync then carries the lease's seats, and a released lease frees the machine for
// the next one — the inventory model end to end, without an API in the way.
describe("machine pool on self-hosted machines", () => {
    let app: INestApplication;
    let projectRepository: ProjectRepository;
    let environmentRepository: EnvironmentRepository;
    let cloudAccountRepository: CloudAccountRepository;
    let machineLeaseRepository: MachineLeaseRepository;
    let machineRepository: MachineRepository;

    beforeEach(async () => {
        process.env.MACHINE_POOL_SLOTS_PER_MACHINE = "2";

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
                RecordLeaseHeartbeatUseCase,
                GetMachineLeaseUseCase,
                SyncMachineUseCase,
                ClaimMachineUseCase,
                ReleaseMachineUseCase,
                ListMachineLeaseIdsUseCase,
                MeasureHeadroomUseCase,
                EnlistMachineUseCase,
                DiscardMachineUseCase,
                ProjectDataSource,
                EnvironmentDataSource,
                CloudAccountDataSource,
                MachineLeaseDataSource,
                MachineDataSource,
                { provide: ProjectRepository, useClass: ProjectRepositoryImpl },
                { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
                { provide: CloudAccountRepository, useClass: CloudAccountRepositoryImpl },
                { provide: MachineLeaseRepository, useClass: MachineLeaseRepositoryImpl },
                { provide: MachineRepository, useClass: MachineRepositoryImpl },
                { provide: MachinePoolGateway, useClass: InProcessMachinePoolGateway },
                { provide: ApplicationLogger, useValue: noopLogger },
                { provide: EnvironmentQuotaPolicy, useValue: new EnvironmentQuotaPolicy(5, 50) },
                RegistrationTokenServiceProvider,
                SlotCapacityPolicyProvider,
                AgentTokenServiceProvider,
                MachineProviderGatewayProvider,
                EnvironmentProviderGatewayProvider,
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();

        projectRepository = app.get(ProjectRepository);
        environmentRepository = app.get(EnvironmentRepository);
        cloudAccountRepository = app.get(CloudAccountRepository);
        machineLeaseRepository = app.get(MachineLeaseRepository);
        machineRepository = app.get(MachineRepository);
    });

    afterEach(async () => {
        delete process.env.MACHINE_POOL_SLOTS_PER_MACHINE;
        await app.close();
    });

    type Seeded = { projectId: string; cloudAccountId: string };

    const seedSelfHostedCloud = async (): Promise<Seeded> => {
        const externalId = UserFactory.createId();
        const project = await projectRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });

        await projectRepository.save(project);

        const cloudAccount = CloudAccount.create({
            projectId: ProjectId.fromString(project.id),
            type: selfHostedCloudType,
        });

        cloudAccount.bindCompute({
            platformName: "android",
            execution: Execution.Emulator,
            kind: "baremetal",
            config: { maxEnvironments: 4 },
        });
        await cloudAccountRepository.save(cloudAccount);

        return { projectId: project.id, cloudAccountId: cloudAccount.id };
    };

    // A machine the way the agent leaves it after registration: online, fit, eight cores = two slots.
    const seedReadyMachine = async (cloudAccountId: string, fqdn: string): Promise<Machine> => {
        const machine = Machine.attach({ cloudAccountId, origin: MachineOrigin.Attached, fqdn, provides: [androidEmulator] });

        machine.expectRegistration("hash", new Date(Date.now() + 60_000));
        machine.register("hash", MachineFacts.fromObject({
            cores: 8,
            memoryMb: 16384,
            virtualization: "kvm",
            emulator: true,
            avds: ["sw-android-14"],
            docker: false,
            vncStack: true,
            agentVersion: "1",
            address: null,
        }), new Date(), policy);
        await machineRepository.create(machine);

        return machine;
    };

    const createEnvironment = async (seeded: Seeded): Promise<string> => {
        const environment = await environmentRepository.create({
            projectId: ProjectId.fromString(seeded.projectId),
            cloudAccountId: CloudAccountId.fromString(seeded.cloudAccountId),
            cloudType: selfHostedCloudType,
            computeKind: "baremetal",
            platform: Platform.fromObject({ name: "android", version: "14", deviceModel: "pixel-7" }),
            execution: Execution.Emulator,
            applications: ApplicationList.fromObject([{ nameAlias: "chrome" }]),
        });

        return environment.id;
    };

    const prepareNext = (): Promise<unknown> => app.get(PrepareNextEnvironmentUseCase).execute();

    const sync = (machine: Machine): ReturnType<SyncMachineUseCase["execute"]> => app.get(SyncMachineUseCase).execute({
        machineId: MachineId.fromString(machine.id),
        facts: machine.facts?.toObject() ?? {
            cores: 8,
            memoryMb: null,
            virtualization: "kvm",
            emulator: true,
            avds: [],
            docker: false,
            vncStack: true,
            agentVersion: "1",
            address: null,
        },
    });

    test("provisioning takes a free machine for the lease; the machine's sync carries the seat", async () => {
        const seeded = await seedSelfHostedCloud();
        const machine = await seedReadyMachine(seeded.cloudAccountId, "box-1.lab");
        const envId = await createEnvironment(seeded);

        await prepareNext();

        const lease = await machineLeaseRepository.findByEnvironment(EnvironmentId.fromString(envId));
        expect(lease?.state).toBe(MachineLeaseState.Ordering);
        expect(lease?.machineId).toBe(machine.id);
        expect(lease?.slotCapacity).toBe(2);

        const held = await machineRepository.get(MachineId.fromString(machine.id));
        expect(held.leaseId).toBe(lease?.id);

        // The agent's next sync: the lease registers at the machine's address and answers with the seat.
        const answer = await sync(machine);
        expect(answer.assignments.map((assignment) => assignment.environmentId)).toEqual([envId]);
        expect(answer.assignments[0].ports.wd).toBe(4600);

        const ready = await machineLeaseRepository.findByEnvironment(EnvironmentId.fromString(envId));
        expect(ready?.state).toBe(MachineLeaseState.Ready);
        expect(ready?.hostIp).toBe("box-1.lab");

        const environment = await environmentRepository.get(EnvironmentId.fromString(envId));
        expect(environment.state).toBe(EnvironmentState.Preparing);
    });

    test("a second environment packs onto the leased machine; a third one needs a second machine", async () => {
        const seeded = await seedSelfHostedCloud();
        const first = await seedReadyMachine(seeded.cloudAccountId, "box-1.lab");
        const second = await seedReadyMachine(seeded.cloudAccountId, "box-2.lab");

        const one = await createEnvironment(seeded);
        const two = await createEnvironment(seeded);
        const three = await createEnvironment(seeded);
        await prepareNext();
        await prepareNext();
        await prepareNext();

        const leaseOfOne = await machineLeaseRepository.findByEnvironment(EnvironmentId.fromString(one));
        const leaseOfTwo = await machineLeaseRepository.findByEnvironment(EnvironmentId.fromString(two));
        const leaseOfThree = await machineLeaseRepository.findByEnvironment(EnvironmentId.fromString(three));

        expect(leaseOfOne?.id).toBe(leaseOfTwo?.id);
        expect(leaseOfThree?.id).not.toBe(leaseOfOne?.id);
        expect(new Set([leaseOfOne?.machineId, leaseOfThree?.machineId])).toEqual(new Set([first.id, second.id]));
    });

    test("with every machine spent, the next environment fails instead of waiting for a machine that cannot come", async () => {
        const seeded = await seedSelfHostedCloud();
        await seedReadyMachine(seeded.cloudAccountId, "box-1.lab");

        await createEnvironment(seeded);
        await createEnvironment(seeded);
        const overflow = await createEnvironment(seeded);
        await prepareNext();
        await prepareNext();
        await prepareNext();

        const environment = await environmentRepository.get(EnvironmentId.fromString(overflow));
        expect(environment.state).toBe(EnvironmentState.Failed);
    });

    test("releasing the last seat and returning the lease frees the machine for the next lease", async () => {
        const seeded = await seedSelfHostedCloud();
        const machine = await seedReadyMachine(seeded.cloudAccountId, "box-1.lab");
        const envId = await createEnvironment(seeded);
        await prepareNext();

        const deleting = await environmentRepository.get(EnvironmentId.fromString(envId));
        deleting.startDeletion();
        await environmentRepository.save(deleting);
        await app.get(DeprovisionDeletingEnvironmentsUseCase).execute();

        const lease = await machineLeaseRepository.findByEnvironment(EnvironmentId.fromString(envId));
        expect(lease).toBeNull();

        // The lease itself lingers empty until the pool's idle sweep returns it; returning it is the
        // provider's deprovision — the machine is free again right there.
        const provider = app.get(MachineProviderGateway);
        const stillHeld = await machineRepository.get(MachineId.fromString(machine.id));
        expect(stillHeld.leaseId).not.toBeNull();

        await provider.deprovision(stillHeld.leaseId as string, {
            cloud: selfHostedCloudType,
            cloudAccountId: seeded.cloudAccountId,
            platformName: "android",
            execution: "emulator",
        });

        const freed = await machineRepository.get(MachineId.fromString(machine.id));
        expect(freed.leaseId).toBeNull();
        expect(freed.isReady()).toBe(true);
    });
});
