import { Injectable } from "@nestjs/common";

import { ProviderAccountRepository } from "../../application/interfaces/repositories/provider-account-repository";
import { NotFoundResourceError } from "../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../domain/entities/project/project-id";
import { ProviderAccount, ProviderAccountCreateParams } from "../../domain/entities/provider-account/provider-account";
import { ProviderAccountId } from "../../domain/entities/provider-account/provider-account-id";
import { ProviderAccountState } from "../../domain/entities/provider-account/provider-account-state";
import { ProviderAccountDataSource } from "../data-sources/database/postgres/provider-account-data-source";

@Injectable()
export class ProviderAccountRepositoryImpl extends ProviderAccountRepository {
    constructor(private readonly providerAccountDataSource: ProviderAccountDataSource) {
        super();
    }

    async create(params: ProviderAccountCreateParams): Promise<ProviderAccount> {
        const providerAccount = ProviderAccount.create(params);

        await this.providerAccountDataSource.create(providerAccount);

        return providerAccount;
    }

    async get(providerAccountId: ProviderAccountId): Promise<ProviderAccount> {
        const data = await this.providerAccountDataSource.findOne(providerAccountId.getValue());

        if (!data) {
            throw new NotFoundResourceError(providerAccountId.getValue());
        }

        return ProviderAccount.fromObject(data);
    }

    async listActiveByAccount(projectId: ProjectId): Promise<Array<ProviderAccount>> {
        const data = await this.providerAccountDataSource.listByAccountAndState(
            projectId.getValue(),
            ProviderAccountState.Active,
        );

        return data.map(ProviderAccount.fromObject);
    }

    async save(providerAccount: ProviderAccount): Promise<void> {
        await this.providerAccountDataSource.save(providerAccount);
    }
}
