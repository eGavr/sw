import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";

import {
    EnvironmentRepository,
} from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../../../../../../src/application/interfaces/repositories/project-repository";
import {
    CollectGarbageEnvironmentsUseCase,
} from "../../../../../../../src/application/use-cases/environments/collect-garbage-environments-use-case";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { Environment } from "../../../../../../../src/domain/entities/environment/environment";
import { EnvironmentEndpoint } from "../../../../../../../src/domain/entities/environment/environment-endpoint";
import { EnvironmentId } from "../../../../../../../src/domain/entities/environment/environment-id";
import { EnvironmentState } from "../../../../../../../src/domain/entities/environment/environment-state";
import { EnvironmentStateReason } from "../../../../../../../src/domain/entities/environment/environment-state-reason";
import { EnvironmentNotFoundError } from "../../../../../../../src/domain/entities/environment/error/environment-not-found-error";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { ProjectId } from "../../../../../../../src/domain/entities/project/project-id";
import { User } from "../../../../../../../src/domain/entities/user/user";
import {
    EnvironmentDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/environment-data-source";
import { ProjectDataSource } from "../../../../../../../src/infrastructure/data-sources/database/postgres/project-data-source";
import { PostgresModule } from "../../../../../../../src/infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import {
    EnvironmentRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/environment-repository-impl";
import { ProjectRepositoryImpl } from "../../../../../../../src/infrastructure/repositories/project-repository-impl";
import { UserFactory } from "../../../utils/entities/user/user-factory";

// GC has no HTTP surface, so it is exercised through its use case against a real Postgres: this
// verifies the real collect query (which states, by which timestamp, null handling) end to end.
describe("environment garbage collection", () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let environmentRepository: EnvironmentRepository;

    let projectRepository: ProjectRepository;

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ envFilePath: [".env", `env/.env.${process.env.NODE_ENV || "development"}`] }),
                PostgresModule,
            ],
            providers: [
                ProjectDataSource,
                EnvironmentDataSource,
                { provide: ProjectRepository, useClass: ProjectRepositoryImpl },
                { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
                CollectGarbageEnvironmentsUseCase,
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();

        dataSource = app.get(DataSource);
        environmentRepository = app.get(EnvironmentRepository);
        projectRepository = app.get(ProjectRepository);
    });

    afterEach(async () => {
        await app.close();
    });

    const create = async (): Promise<Environment> => {
        const externalId = UserFactory.createId();
        const project = await projectRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });
        await projectRepository.save(project);

        return environmentRepository.create({
            projectId: ProjectId.fromString(project.id),
            platform: Platform.fromObject({ name: "linux", version: "latest" }),
            applications: ApplicationList.fromObject([{ name: "chrome", version: "latest" }]),
        });
    };

    // deleting, container gone (never sent a heartbeat).
    const seedDeletingWithoutHeartbeat = async (): Promise<string> => {
        const environment = await create();
        environment.startDeletion();
        await environmentRepository.save(environment);

        return environment.id;
    };

    // deleting, heartbeat still fresh (container has not stopped yet).
    const seedFreshDeleting = async (): Promise<string> => {
        const environment = await create();
        environment.claim();
        environment.markDispatched();
        environment.register(new EnvironmentEndpoint("http://127.0.0.1:4444"), new Date());
        environment.startDeletion();
        await environmentRepository.save(environment);

        return environment.id;
    };

    const seedFailed = async (aged: boolean): Promise<string> => {
        const environment = await create();
        environment.claim();
        environment.failProvisioning(EnvironmentStateReason.ProviderError);
        await environmentRepository.save(environment);

        if (aged) {
            await dataSource.query("UPDATE environment SET updated_at = now() - interval '1 hour' WHERE id = $1", [environment.id]);
        }

        return environment.id;
    };

    const isGone = async (id: string): Promise<void> => {
        await expect(environmentRepository.get(EnvironmentId.fromString(id))).rejects.toBeInstanceOf(EnvironmentNotFoundError);
    };

    const stateOf = async (id: string): Promise<EnvironmentState> => {
        return (await environmentRepository.get(EnvironmentId.fromString(id))).state;
    };

    test("collects deleting-without-heartbeat and expired failed, keeps fresh deleting and within-TTL failed", async () => {
        const deletingGone = await seedDeletingWithoutHeartbeat();
        const failedExpired = await seedFailed(true);
        const deletingKept = await seedFreshDeleting();
        const failedKept = await seedFailed(false);

        await app.get(CollectGarbageEnvironmentsUseCase).execute({ freshnessMs: 6_000, failedTtlMs: 100_000 });

        await isGone(deletingGone);
        await isGone(failedExpired);
        expect(await stateOf(deletingKept)).toBe(EnvironmentState.Deleting);
        expect(await stateOf(failedKept)).toBe(EnvironmentState.Failed);
    });
});
