import { Injectable } from "@nestjs/common";

import { AccountId } from "../../../../domain/entities/account/account-id";
import { ApplicationList } from "../../../../domain/entities/environment/application/application-list";
import { Environment, EnvironmentData } from "../../../../domain/entities/environment/environment";
import { Platform } from "../../../../domain/entities/environment/platform/platform";
import { EnvironmentProviderName } from "../../../../domain/entities/environment/provider/environment-provider-name";
import { CreateEnvironmentInput, EnvironmentDataSource } from "../environment-data-source";

import { LocalComputeStore } from "./local-compute-store";

@Injectable()
export class LocalEnvironmentDataSource extends EnvironmentDataSource {
    constructor(private readonly store: LocalComputeStore) {
        super();
    }

    async create(input: CreateEnvironmentInput): Promise<EnvironmentData> {
        const environment = Environment.create({
            accountId: AccountId.fromString(input.accountId),
            providerName: EnvironmentProviderName.Local,
            platform: Platform.fromObject(input.platform),
            applications: ApplicationList.fromObject(input.applications),
        });

        return this.store.saveEnvironment(environment.toObject());
    }

    async get(id: string): Promise<EnvironmentData | null> {
        return this.store.getEnvironment(id);
    }

    async listByAccount(accountId: string): Promise<Array<EnvironmentData>> {
        return this.store.listEnvironmentsByAccount(accountId);
    }

    async delete(id: string): Promise<void> {
        this.store.removeEnvironment(id);
    }
}
