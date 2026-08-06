import { Injectable } from "@nestjs/common";

import { AccountId } from "../../domain/entities/account/account-id";
import { ApplicationList } from "../../domain/entities/environment/application/application-list";
import { Environment } from "../../domain/entities/environment/environment";
import { EnvironmentId } from "../../domain/entities/environment/environment-id";
import { EnvironmentState } from "../../domain/entities/environment/environment-state";
import { EnvironmentNotFoundError } from "../../domain/entities/environment/error/environment-not-found-error";
import { Platform } from "../../domain/entities/environment/platform/platform";
import { ProviderAccountId } from "../../domain/entities/provider-account/provider-account-id";
import { EnvironmentDataSource } from "../data-sources/database/postgres/environment-data-source";

export type CreateEnvironmentParams = {
    accountId: AccountId;
    providerAccountId: ProviderAccountId;
    platform: Platform;
    applications: ApplicationList;
};

@Injectable()
export class EnvironmentRepository {
    constructor(private readonly environmentDataSource: EnvironmentDataSource) {}

    async create(params: CreateEnvironmentParams): Promise<Environment> {
        const environment = Environment.create(params);

        await this.environmentDataSource.create(environment);

        return environment;
    }

    async get(environmentId: EnvironmentId): Promise<Environment> {
        const data = await this.environmentDataSource.findOne(environmentId.getValue());

        if (!data) {
            throw new EnvironmentNotFoundError(environmentId.getValue());
        }

        return Environment.fromObject(data);
    }

    async listByAccount(accountId: AccountId): Promise<Array<Environment>> {
        const data = await this.environmentDataSource.findAllByAccount(accountId.getValue());

        return data.map(Environment.fromObject);
    }

    async listByState(state: EnvironmentState): Promise<Array<Environment>> {
        const data = await this.environmentDataSource.findByState(state);

        return data.map(Environment.fromObject);
    }

    // Atomically claim the next enqueued environment under a row lock and run `mutate` (the domain
    // transition, e.g. e.claim()) on it. The lock/tx are the data source's job; nothing is claimed
    // if the queue is empty (returns null).
    async withNextEnqueued(mutate: (environment: Environment) => void): Promise<Environment | null> {
        const data = await this.environmentDataSource.withNext(EnvironmentState.Enqueued, (row) => {
            const environment = Environment.fromObject(row);

            mutate(environment);

            return environment.toObject();
        });

        return data ? Environment.fromObject(data) : null;
    }

    async save(environment: Environment): Promise<void> {
        await this.environmentDataSource.save(environment);
    }
}
