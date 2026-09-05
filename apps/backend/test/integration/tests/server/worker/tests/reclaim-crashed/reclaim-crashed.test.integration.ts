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
    ReclaimCrashedEnvironmentsUseCase,
} from "../../../../../../../src/application/use-cases/environments/reclaim-crashed-environments-use-case";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { EnvironmentEndpoint } from "../../../../../../../src/domain/entities/environment/environment-endpoint";
import { EnvironmentId } from "../../../../../../../src/domain/entities/environment/environment-id";
import { EnvironmentState } from "../../../../../../../src/domain/entities/environment/environment-state";
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

const freshnessMs = 6_000;

// The worker has no HTTP surface, so crashed-executing reclaim is exercised through its use case against
// a real Postgres, with the external compute gateway faked (the only mock the policy allows). This
// verifies the real stale-executing query and the transition + inline teardown, not just the domain rule.
describe("crashed-executing reclaim", () => {
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
                ReclaimCrashedEnvironmentsUseCase,
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

    // Drive an environment enqueued -> starting -> preparing -> executing under a real project.
    const seedExecuting = async (): Promise<string> => {
        const externalId = UserFactory.createId();
        const project = await projectRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });
        await projectRepository.save(project);

        await environmentRepository.create({
            projectId: ProjectId.fromString(project.id),
            platform: Platform.fromObject({ name: "ubuntu", version: "24.04" }),
            applications: ApplicationList.fromObject([{ name: "chrome", version: "latest" }]),
        });

        const claimed = await environmentRepository.withNextEnqueued((environment) => environment.claim());

        if (!claimed) {
            throw new Error("expected an enqueued environment to claim");
        }

        claimed.markDispatched();
        await environmentRepository.save(claimed);

        const preparing = await environmentRepository.get(EnvironmentId.fromString(claimed.id));
        preparing.register(new EnvironmentEndpoint("http://127.0.0.1:44444"), new Date());
        await environmentRepository.save(preparing);

        return claimed.id;
    };

    const reclaim = (): Promise<void> => app.get(ReclaimCrashedEnvironmentsUseCase).execute({ freshnessMs });

    const staleHeartbeat = (id: string): Promise<unknown> =>
        dataSource.query(
            "UPDATE environment SET updated_at = now() - interval '1 hour', last_heartbeat_at = now() - interval '1 hour'"
            + " WHERE id = $1",
            [id],
        );

    test("tears down a crashed executing environment and moves it to deleting for GC", async () => {
        const id = await seedExecuting();
        await staleHeartbeat(id);

        await reclaim();

        const environment = await environmentRepository.get(EnvironmentId.fromString(id));
        expect(environment.state).toBe(EnvironmentState.Deleting);
        expect(deprovision).toHaveBeenCalledTimes(1);
    });

    test("leaves a healthy executing environment alone", async () => {
        const id = await seedExecuting();

        await reclaim();

        const environment = await environmentRepository.get(EnvironmentId.fromString(id));
        expect(environment.state).toBe(EnvironmentState.Executing);
        expect(deprovision).not.toHaveBeenCalled();
    });
});
