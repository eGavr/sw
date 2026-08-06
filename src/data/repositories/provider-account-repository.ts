import { Injectable } from "@nestjs/common";

import { AccountId } from "../../domain/entities/account/account-id";
import { ProviderAccount, ProviderAccountCreateParams } from "../../domain/entities/provider-account/provider-account";
import { ProviderAccountState } from "../../domain/entities/provider-account/provider-account-state";
import { ProviderAccountDataSource } from "../data-sources/database/postgres/provider-account-data-source";

@Injectable()
export class ProviderAccountRepository {
    constructor(private readonly providerAccountDataSource: ProviderAccountDataSource) {}

    async create(params: ProviderAccountCreateParams): Promise<ProviderAccount> {
        const providerAccount = ProviderAccount.create(params);

        await this.providerAccountDataSource.create(providerAccount);

        return providerAccount;
    }

    async findActiveByAccount(accountId: AccountId): Promise<ProviderAccount | null> {
        const data = await this.providerAccountDataSource.findOneByAccountAndState(
            accountId.getValue(),
            ProviderAccountState.Active,
        );

        return data ? ProviderAccount.fromObject(data) : null;
    }

    async save(providerAccount: ProviderAccount): Promise<void> {
        await this.providerAccountDataSource.save(providerAccount);
    }
}
