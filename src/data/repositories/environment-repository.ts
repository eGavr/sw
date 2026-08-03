import { Injectable } from "@nestjs/common";

import { AccountId } from "../../domain/entities/account/account-id";
import { ApplicationList } from "../../domain/entities/environment/application/application-list";
import { Environment } from "../../domain/entities/environment/environment";
import { EnvironmentId } from "../../domain/entities/environment/environment-id";
import { EnvironmentNotFoundError } from "../../domain/entities/environment/error/environment-not-found-error";
import { Platform } from "../../domain/entities/environment/platform/platform";
import { EnvironmentDataSource } from "../data-sources/compute/environment-data-source";

export type CreateEnvironmentParams = {
    accountId: AccountId;
    platform: Platform;
    applications: ApplicationList;
};

@Injectable()
export class EnvironmentRepository {
    constructor(private readonly environmentDataSource: EnvironmentDataSource) {}

    async create(params: CreateEnvironmentParams): Promise<Environment> {
        const data = await this.environmentDataSource.create({
            accountId: params.accountId.getValue(),
            platform: params.platform.toObject(),
            applications: params.applications.toArray(),
        });

        return Environment.fromObject(data);
    }

    async get(environmentId: EnvironmentId): Promise<Environment> {
        const data = await this.environmentDataSource.get(environmentId.getValue());

        if (!data) {
            throw new EnvironmentNotFoundError(environmentId.getValue());
        }

        return Environment.fromObject(data);
    }

    async listByAccount(accountId: AccountId): Promise<Array<Environment>> {
        const data = await this.environmentDataSource.listByAccount(accountId.getValue());

        return data.map(Environment.fromObject);
    }

    async delete(environmentId: EnvironmentId): Promise<void> {
        await this.environmentDataSource.delete(environmentId.getValue());
    }
}
