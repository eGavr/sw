import { AccountId } from "../../domain/entities/account/account-id";
import { Application } from "../../domain/entities/environment/application/application";
import { ApplicationKind } from "../../domain/entities/environment/application/application-kind";
import { ApplicationList } from "../../domain/entities/environment/application/application-list";
import { EnvironmentId } from "../../domain/entities/environment/environment-id";
import { EnvironmentNotFoundError } from "../../domain/entities/environment/error/environment-not-found-error";
import { Platform } from "../../domain/entities/environment/platform/platform";
import { PlatformName } from "../../domain/entities/environment/platform/platform-name";
import { LocalEnvironmentDataSource } from "../data-sources/compute/local/environment-data-source";
import { LocalComputeStore } from "../data-sources/compute/local/local-compute-store";

import { CreateEnvironmentParams, EnvironmentRepository } from "./environment-repository";

describe("EnvironmentRepository", () => {
    const build = (): EnvironmentRepository => new EnvironmentRepository(new LocalEnvironmentDataSource(new LocalComputeStore()));

    const params = (accountId: AccountId): CreateEnvironmentParams => ({
        accountId,
        platform: Platform.create({ name: PlatformName.Linux, version: "22.04" }),
        applications: ApplicationList.create({
            applications: [Application.create({ name: "chrome", version: "100", kind: ApplicationKind.Browser })],
        }),
    });

    test("should create an environment stamped with the local provider and an endpoint", async () => {
        const repository = build();
        const accountId = AccountId.create();

        const environment = await repository.create(params(accountId));

        expect(environment.providerName).toBe("Local");
        expect(environment.accountId.getValue()).toBe(accountId.getValue());
        expect(environment.endpoint).toBe(`local://environments/${environment.id}`);
        expect(environment.supports(Application.create({ name: "chrome", version: "100", kind: ApplicationKind.Browser }))).toBe(true);
    });

    test("should throw EnvironmentNotFoundError for a missing environment", async () => {
        const repository = build();

        await expect(repository.get(EnvironmentId.create())).rejects.toBeInstanceOf(EnvironmentNotFoundError);
    });

    test("should list environments by account and delete them", async () => {
        const repository = build();
        const accountId = AccountId.create();
        const created = await repository.create(params(accountId));

        expect((await repository.listByAccount(accountId)).map((environment) => environment.id)).toEqual([created.id]);

        await repository.delete(EnvironmentId.fromString(created.id));

        expect(await repository.listByAccount(accountId)).toEqual([]);
    });
});
