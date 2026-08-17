import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";

import { EnvironmentProviderGateway } from "../../../../../../../src/application/interfaces/gateways/environment-provider-gateway";
import {
    EnvironmentRepository,
} from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../../../../../../src/application/interfaces/repositories/project-repository";
import {
    ReclaimStuckEnvironmentsUseCase,
} from "../../../../../../../src/application/use-cases/environments/reclaim-stuck-environments-use-case";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { EnvironmentId } from "../../../../../../../src/domain/entities/environment/environment-id";
import { EnvironmentState } from "../../../../../../../src/domain/entities/environment/environment-state";
import { EnvironmentStateReason } from "../../../../../../../src/domain/entities/environment/environment-state-reason";
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

// The worker has no HTTP surface, so the reaper is exercised through its use case against a real
// Postgres, with the external compute gateway faked (the only mock the testing policy allows). This
// verifies the real stale-row query and the reclaim/fail wiring, not just the domain decision.
describe("environment reaper", () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let projectRepository: ProjectRepository;
    let environmentRepository: EnvironmentRepository;
    let deprovision: jest.Mock;

    beforeEach(async () => {
        deprovision = jest.fn(async (): Promise<void> => undefined);

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
                {
                    provide: EnvironmentProviderGateway,
                    useValue: { provision: async (): Promise<void> => undefined, deprovision },
                },
                ReclaimStuckEnvironmentsUseCase,
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();

        dataSource = app.get(DataSource);
        projectRepository = app.get(ProjectRepository);
        environmentRepository = app.get(EnvironmentRepository);
    });

    afterEach(async () => {
        await app.close();
    });

    // Seed an enqueued environment under a real project, claim it into `starting` (attempts = 1), then
    // backdate updated_at so it is past the provisioning lease.
    const seedStuckStarting = async (): Promise<string> => {
        const externalId = UserFactory.createId();
        const project = await projectRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });
        await projectRepository.save(project);

        await environmentRepository.create({
            projectId: ProjectId.fromString(project.id),
            provider: "noop",
            platform: Platform.fromObject({ name: "linux", version: "latest" }),
            applications: ApplicationList.fromObject([{ name: "chrome", version: "latest" }]),
        });

        const claimed = await environmentRepository.withNextEnqueued((environment) => environment.claim());

        if (!claimed) {
            throw new Error("expected an enqueued environment to claim");
        }

        await dataSource.query("UPDATE environment SET updated_at = now() - interval '1 hour' WHERE id = $1", [claimed.id]);

        return claimed.id;
    };

    const reclaim = (maxAttempts: number): Promise<void> =>
        app.get(ReclaimStuckEnvironmentsUseCase).execute({
            startingTimeoutMs: 15_000,
            preparingTimeoutMs: 120_000,
            maxAttempts,
        });

    test("returns a stuck starting environment to the queue while within the retry budget", async () => {
        const id = await seedStuckStarting();

        await reclaim(3);

        const environment = await environmentRepository.get(EnvironmentId.fromString(id));
        expect(environment.state).toBe(EnvironmentState.Enqueued);
        expect(deprovision).not.toHaveBeenCalled();
    });

    test("fails a stuck environment once the retry budget is spent and tears its container down", async () => {
        const id = await seedStuckStarting();

        await reclaim(1);

        const environment = await environmentRepository.get(EnvironmentId.fromString(id));
        expect(environment.state).toBe(EnvironmentState.Failed);
        expect(environment.stateReason).toBe(EnvironmentStateReason.ProvisioningTimeout);
        expect(deprovision).toHaveBeenCalledTimes(1);
    });
});
