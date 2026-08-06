import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";

import { EnvironmentProviderGateway } from "../../../../../../../src/application/interfaces/gateways/environment-provider-gateway";
import {
    EnvironmentProviderGatewayResolver,
} from "../../../../../../../src/application/interfaces/gateways/environment-provider-gateway-resolver";
import { AccountRepository } from "../../../../../../../src/application/interfaces/repositories/account-repository";
import {
    EnvironmentRepository,
} from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import {
    ProviderAccountRepository,
} from "../../../../../../../src/application/interfaces/repositories/provider-account-repository";
import {
    ReclaimStuckEnvironmentsUseCase,
} from "../../../../../../../src/application/use-cases/environments/reclaim-stuck-environments-use-case";
import { AccountId } from "../../../../../../../src/domain/entities/account/account-id";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { EnvironmentId } from "../../../../../../../src/domain/entities/environment/environment-id";
import { EnvironmentState } from "../../../../../../../src/domain/entities/environment/environment-state";
import { EnvironmentStateReason } from "../../../../../../../src/domain/entities/environment/environment-state-reason";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { ProviderAccountId } from "../../../../../../../src/domain/entities/provider-account/provider-account-id";
import { User } from "../../../../../../../src/domain/entities/user/user";
import { AccountDataSource } from "../../../../../../../src/infrastructure/data-sources/database/postgres/account-data-source";
import {
    EnvironmentDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/environment-data-source";
import {
    ProviderAccountDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/provider-account-data-source";
import { PostgresModule } from "../../../../../../../src/infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import { AccountRepositoryImpl } from "../../../../../../../src/infrastructure/repositories/account-repository-impl";
import {
    EnvironmentRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/environment-repository-impl";
import {
    ProviderAccountRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/provider-account-repository-impl";
import { UserFactory } from "../../../utils/entities/user/user-factory";

// The worker has no HTTP surface, so the reaper is exercised through its use case against a real
// Postgres, with the external compute gateway faked (the only mock the testing policy allows). This
// verifies the real stale-row query and the reclaim/fail wiring, not just the domain decision.
describe("environment reaper", () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let accountRepository: AccountRepository;
    let providerAccountRepository: ProviderAccountRepository;
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
                ProviderAccountDataSource,
                EnvironmentDataSource,
                { provide: AccountRepository, useClass: AccountRepositoryImpl },
                { provide: ProviderAccountRepository, useClass: ProviderAccountRepositoryImpl },
                { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
                {
                    provide: EnvironmentProviderGatewayResolver,
                    useValue: {
                        resolve: (): EnvironmentProviderGateway =>
                            ({ provision: async (): Promise<void> => undefined, deprovision }),
                    },
                },
                ReclaimStuckEnvironmentsUseCase,
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();

        dataSource = app.get(DataSource);
        accountRepository = app.get(AccountRepository);
        providerAccountRepository = app.get(ProviderAccountRepository);
        environmentRepository = app.get(EnvironmentRepository);
    });

    afterEach(async () => {
        await app.close();
    });

    // Seed an enqueued environment under a real account, claim it into `starting` (attempts = 1), then
    // backdate updated_at so it is past the provisioning lease.
    const seedStuckStarting = async (): Promise<string> => {
        const externalId = UserFactory.createId();
        const account = await accountRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });
        await accountRepository.save(account);

        const providerAccount = await providerAccountRepository.create({
            accountId: AccountId.fromString(account.id),
            providerType: "local",
        });

        await environmentRepository.create({
            accountId: AccountId.fromString(account.id),
            providerAccountId: ProviderAccountId.fromString(providerAccount.id),
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
