import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";

import { EnvironmentProviderGateway } from "../../../../../../../src/application/interfaces/gateways/environment-provider-gateway";
import { AccountRepository } from "../../../../../../../src/application/interfaces/repositories/account-repository";
import {
    EnvironmentRepository,
} from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import {
    ReclaimCrashedEnvironmentsUseCase,
} from "../../../../../../../src/application/use-cases/environments/reclaim-crashed-environments-use-case";
import { AccountId } from "../../../../../../../src/domain/entities/account/account-id";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { EnvironmentEndpoint } from "../../../../../../../src/domain/entities/environment/environment-endpoint";
import { EnvironmentId } from "../../../../../../../src/domain/entities/environment/environment-id";
import { EnvironmentState } from "../../../../../../../src/domain/entities/environment/environment-state";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { User } from "../../../../../../../src/domain/entities/user/user";
import { AccountDataSource } from "../../../../../../../src/infrastructure/data-sources/database/postgres/account-data-source";
import {
    EnvironmentDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/environment-data-source";
import { PostgresModule } from "../../../../../../../src/infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import { AccountRepositoryImpl } from "../../../../../../../src/infrastructure/repositories/account-repository-impl";
import {
    EnvironmentRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/environment-repository-impl";
import { UserFactory } from "../../../utils/entities/user/user-factory";

const freshnessMs = 6_000;

// The worker has no HTTP surface, so crashed-executing reclaim is exercised through its use case against
// a real Postgres, with the external compute gateway faked (the only mock the policy allows). This
// verifies the real stale-executing query and the transition + inline teardown, not just the domain rule.
describe("crashed-executing reclaim", () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let accountRepository: AccountRepository;
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
                AccountDataSource,
                EnvironmentDataSource,
                { provide: AccountRepository, useClass: AccountRepositoryImpl },
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
        accountRepository = app.get(AccountRepository);
        environmentRepository = app.get(EnvironmentRepository);
    });

    afterEach(async () => {
        await app.close();
    });

    // Drive an environment enqueued -> starting -> preparing -> executing under a real account.
    const seedExecuting = async (): Promise<string> => {
        const externalId = UserFactory.createId();
        const account = await accountRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });
        await accountRepository.save(account);

        await environmentRepository.create({
            accountId: AccountId.fromString(account.id),
            provider: "noop",
            platform: Platform.fromObject({ name: "linux", version: "latest" }),
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
