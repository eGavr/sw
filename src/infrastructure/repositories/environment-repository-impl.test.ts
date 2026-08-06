import { CreateEnvironmentParams } from "../../application/interfaces/repositories/environment-repository";
import { AccountId } from "../../domain/entities/account/account-id";
import { Application } from "../../domain/entities/environment/application/application";
import { ApplicationList } from "../../domain/entities/environment/application/application-list";
import { Environment, EnvironmentData } from "../../domain/entities/environment/environment";
import { EnvironmentId } from "../../domain/entities/environment/environment-id";
import { EnvironmentState } from "../../domain/entities/environment/environment-state";
import { EnvironmentNotFoundError } from "../../domain/entities/environment/error/environment-not-found-error";
import { Platform } from "../../domain/entities/environment/platform/platform";
import { PlatformName } from "../../domain/entities/environment/platform/platform-name";
import { EnvironmentDataSource } from "../data-sources/database/postgres/environment-data-source";

import { EnvironmentRepositoryImpl } from "./environment-repository-impl";

class FakeEnvironmentDataSource {
    private readonly rows = new Map<string, EnvironmentData>();

    async create(environment: Environment): Promise<void> {
        const data = environment.toObject();
        this.rows.set(data.id, data);
    }

    async save(environment: Environment): Promise<void> {
        const data = environment.toObject();
        this.rows.set(data.id, data);
    }

    async findOne(id: string): Promise<EnvironmentData | null> {
        return this.rows.get(id) ?? null;
    }

    async findAllByAccount(accountId: string): Promise<Array<EnvironmentData>> {
        return [...this.rows.values()].filter((row) => row.accountId === accountId);
    }
}

describe("EnvironmentRepositoryImpl", () => {
    const build = (): EnvironmentRepositoryImpl =>
        new EnvironmentRepositoryImpl(new FakeEnvironmentDataSource() as unknown as EnvironmentDataSource);

    const params = (accountId: AccountId): CreateEnvironmentParams => ({
        accountId,
        platform: Platform.create({ name: PlatformName.Linux, version: "22.04" }),
        applications: ApplicationList.create({ applications: [Application.create({ name: "chrome", version: "100" })] }),
    });

    test("should create an enqueued environment for the account", async () => {
        const repository = build();
        const accountId = AccountId.create();

        const environment = await repository.create(params(accountId));

        expect(environment.state).toBe(EnvironmentState.Enqueued);
        expect(environment.accountId.getValue()).toBe(accountId.getValue());
        expect(environment.supports(Application.create({ name: "chrome", version: "100" }))).toBe(true);
    });

    test("should throw EnvironmentNotFoundError for a missing environment", async () => {
        const repository = build();

        await expect(repository.get(EnvironmentId.create())).rejects.toBeInstanceOf(EnvironmentNotFoundError);
    });

    test("should list environments by account and persist deletion as the deleting state", async () => {
        const repository = build();
        const accountId = AccountId.create();
        const created = await repository.create(params(accountId));

        expect((await repository.listByAccount(accountId)).map((environment) => environment.id)).toEqual([created.id]);

        created.startDeletion();
        await repository.save(created);

        const [reloaded] = await repository.listByAccount(accountId);

        expect(reloaded.state).toBe(EnvironmentState.Deleting);
    });
});
