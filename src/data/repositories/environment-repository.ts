import { Injectable } from "@nestjs/common";

import { AccountId } from "../../domain/entities/account/account-id";
import { ApplicationList } from "../../domain/entities/environment/application/application-list";
import { Environment } from "../../domain/entities/environment/environment";
import { EnvironmentId } from "../../domain/entities/environment/environment-id";
import { EnvironmentNotFoundError } from "../../domain/entities/environment/error/environment-not-found-error";
import { Platform } from "../../domain/entities/environment/platform/platform";
import { EnvironmentDataSource } from "../data-sources/database/postgres/environment-data-source";

export type CreateEnvironmentParams = {
    accountId: AccountId;
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

    async save(environment: Environment): Promise<void> {
        await this.environmentDataSource.save(environment);
    }
}
