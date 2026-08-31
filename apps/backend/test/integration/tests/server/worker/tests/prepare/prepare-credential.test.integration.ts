import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";

import { CloudCredential } from "../../../../../../../src/application/interfaces/gateways/cloud-credential";
import {
    EnvironmentProviderGateway,
} from "../../../../../../../src/application/interfaces/gateways/environment-provider-gateway";
import { SecretStore } from "../../../../../../../src/application/interfaces/gateways/secret-store";
import { Logger } from "../../../../../../../src/application/interfaces/logger";
import {
    CloudAccountRepository,
} from "../../../../../../../src/application/interfaces/repositories/cloud-account-repository";
import {
    EnvironmentRepository,
} from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../../../../../../src/application/interfaces/repositories/project-repository";
import {
    PrepareNextEnvironmentUseCase,
} from "../../../../../../../src/application/use-cases/environments/prepare-next-environment-use-case";
import { CloudAccount } from "../../../../../../../src/domain/entities/cloud-account/cloud-account";
import { CloudAccountId } from "../../../../../../../src/domain/entities/cloud-account/cloud-account-id";
import { Stereotype } from "../../../../../../../src/domain/entities/cloud-account/stereotype";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { Execution } from "../../../../../../../src/domain/entities/environment/execution";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { ProjectId } from "../../../../../../../src/domain/entities/project/project-id";
import { User } from "../../../../../../../src/domain/entities/user/user";
import {
    CloudAccountDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/cloud-account-data-source";
import {
    EnvironmentDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/environment-data-source";
import { ProjectDataSource } from "../../../../../../../src/infrastructure/data-sources/database/postgres/project-data-source";
import { PostgresModule } from "../../../../../../../src/infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import {
    InMemorySecretStore,
} from "../../../../../../../src/infrastructure/gateways/secret-store/in-memory-secret-store";
import {
    CloudAccountRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/cloud-account-repository-impl";
import {
    EnvironmentRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/environment-repository-impl";
import { ProjectRepositoryImpl } from "../../../../../../../src/infrastructure/repositories/project-repository-impl";
import { UserFactory } from "../../../utils/entities/user/user-factory";

// The worker has no HTTP surface, so provisioning is exercised through its use case against a real
// Postgres and secret store, with only the external compute gateway faked (the mock the testing policy
// allows). This verifies the credentialRef -> secret store -> provision hand-off, not just its wiring.
describe("prepare-next-environment credential resolution", () => {
    let app: INestApplication;
    let projectRepository: ProjectRepository;
    let environmentRepository: EnvironmentRepository;
    let cloudAccountRepository: CloudAccountRepository;
    let secretStore: SecretStore;
    let provision: jest.Mock;

    beforeEach(async () => {
        provision = jest.fn(async (): Promise<void> => undefined);

        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ envFilePath: [".env", `env/.env.${process.env.NODE_ENV || "development"}`] }),
                PostgresModule,
            ],
            providers: [
                ProjectDataSource,
                EnvironmentDataSource,
                CloudAccountDataSource,
                { provide: ProjectRepository, useClass: ProjectRepositoryImpl },
                { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
                { provide: CloudAccountRepository, useClass: CloudAccountRepositoryImpl },
                { provide: SecretStore, useClass: InMemorySecretStore },
                { provide: EnvironmentProviderGateway, useValue: { provision, deprovision: async (): Promise<void> => undefined } },
                { provide: Logger, useValue: { log: (): void => undefined, warn: (): void => undefined, error: (): void => undefined } },
                PrepareNextEnvironmentUseCase,
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();

        projectRepository = app.get(ProjectRepository);
        environmentRepository = app.get(EnvironmentRepository);
        cloudAccountRepository = app.get(CloudAccountRepository);
        secretStore = app.get(SecretStore);
    });

    afterEach(async () => {
        await app.close();
    });

    // Seed a project with a `local` cloud account (optionally carrying a stored credential) and one enqueued
    // environment bound to it, ready for the worker to claim and provision.
    const seedEnqueued = async (credential: string | null): Promise<void> => {
        const externalId = UserFactory.createId();
        const project = await projectRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });
        await projectRepository.save(project);

        const projectId = ProjectId.fromString(project.id);
        const credentialRef = credential === null ? null : await secretStore.store(credential);
        const cloudAccount = CloudAccount.create({
            projectId,
            type: "local",
            provides: [new Stereotype("linux", Execution.Container)],
            credentialRef,
        });
        await cloudAccountRepository.save(cloudAccount);

        await environmentRepository.create({
            projectId,
            platform: Platform.fromObject({ name: "linux", version: "latest" }),
            applications: ApplicationList.fromObject([{ name: "chrome", version: "latest" }]),
            cloudAccountId: CloudAccountId.fromString(cloudAccount.id),
            cloudType: "local",
        });
    };

    test("resolves the bound account's credential and hands it to provision", async () => {
        const material = "yc-service-account-key-json-blob";
        await seedEnqueued(material);

        await app.get(PrepareNextEnvironmentUseCase).execute();

        expect(provision).toHaveBeenCalledTimes(1);
        const [, cloudAccount, credential] = provision.mock.calls[0] as [unknown, CloudAccount, CloudCredential];
        expect(cloudAccount.type).toBe("local");
        expect(credential).toBeInstanceOf(CloudCredential);
        expect(credential.reveal()).toBe(material);
    });

    test("passes a null credential when the bound account has none", async () => {
        await seedEnqueued(null);

        await app.get(PrepareNextEnvironmentUseCase).execute();

        expect(provision).toHaveBeenCalledTimes(1);
        expect(provision.mock.calls[0][2]).toBeNull();
    });
});
