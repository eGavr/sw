import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";

import {
    EnvironmentRepository,
} from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../../../../../../src/application/interfaces/repositories/project-repository";
import {
    ReleaseStaleReservationsUseCase,
} from "../../../../../../../src/application/use-cases/environments/release-stale-reservations-use-case";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { EnvironmentEndpoint } from "../../../../../../../src/domain/entities/environment/environment-endpoint";
import { EnvironmentId } from "../../../../../../../src/domain/entities/environment/environment-id";
import {
    EnvironmentOccupancy,
} from "../../../../../../../src/domain/entities/environment/environment-occupancy";
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

const stalenessMs = 10_000;

// The worker has no HTTP surface, so the reservation sweep is exercised through its use case against a
// real Postgres. This verifies the real stale-reservation query (occupancy + lapsed reservation
// heartbeat) and the release under the row lock, not just the domain rule.
describe("stale-reservation sweep", () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let projectRepository: ProjectRepository;
    let environmentRepository: EnvironmentRepository;

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
                ReleaseStaleReservationsUseCase,
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

    // Drive an environment enqueued -> ... -> executing and reserve it (what a wd instance leaves
    // behind if it dies mid-create).
    const seedReserved = async (): Promise<string> => {
        const externalId = UserFactory.createId();
        const project = await projectRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });
        await projectRepository.save(project);

        await environmentRepository.create({
            projectId: ProjectId.fromString(project.id),
            platform: Platform.fromObject({ name: "linux", version: "latest" }),
            applications: ApplicationList.fromObject([{ name: "chrome", version: "latest" }]),
        });

        const claimed = await environmentRepository.withNextEnqueued((environment) => environment.claim());

        if (!claimed) {
            throw new Error("expected an enqueued environment to claim");
        }

        claimed.markDispatched();
        await environmentRepository.save(claimed);

        await environmentRepository.with(EnvironmentId.fromString(claimed.id), (environment) => {
            environment.register(new EnvironmentEndpoint("http://127.0.0.1:44444"), new Date());
            environment.reserve(new Date());
        });

        return claimed.id;
    };

    const sweep = (): Promise<void> => app.get(ReleaseStaleReservationsUseCase).execute({ stalenessMs });

    const staleReservationHeartbeat = (id: string): Promise<unknown> =>
        dataSource.query(
            "UPDATE environment SET occupancy_last_confirmed_at = now() - interval '1 hour' WHERE id = $1",
            [id],
        );

    test("returns a dead reserver's environment to the pool", async () => {
        const id = await seedReserved();
        await staleReservationHeartbeat(id);

        await sweep();

        const environment = await environmentRepository.get(EnvironmentId.fromString(id));
        expect(environment.occupancy).toBe(EnvironmentOccupancy.Free);
    });

    test("leaves a freshly heartbeating reservation alone — a slow create is not a dead reserver", async () => {
        const id = await seedReserved();

        await sweep();

        const environment = await environmentRepository.get(EnvironmentId.fromString(id));
        expect(environment.occupancy).toBe(EnvironmentOccupancy.Reserved);
    });
});
