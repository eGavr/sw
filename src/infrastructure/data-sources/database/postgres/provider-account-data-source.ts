import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

import {
    ProviderAccount as ProviderAccountEntity,
    ProviderAccountData,
} from "../../../../domain/entities/provider-account/provider-account";

import { ProviderAccount } from "./typeorm/entities/provider-account/provider-account";

@Injectable()
export class ProviderAccountDataSource {
    constructor(private readonly dataSource: DataSource) {}

    async create(providerAccount: ProviderAccountEntity): Promise<void> {
        await this.dataSource.getRepository(ProviderAccount).save(ProviderAccount.from(providerAccount));
    }

    async save(providerAccount: ProviderAccountEntity): Promise<void> {
        await this.dataSource.getRepository(ProviderAccount).save(ProviderAccount.from(providerAccount));
    }

    async findOne(id: string): Promise<ProviderAccountData | null> {
        const providerAccount = await this.dataSource.getRepository(ProviderAccount).findOne({ where: { id } });

        return providerAccount?.toObject() ?? null;
    }

    async listByAccountAndState(projectId: string, state: string): Promise<Array<ProviderAccountData>> {
        const providerAccounts = await this.dataSource.getRepository(ProviderAccount).find({ where: { projectId, state } });

        return providerAccounts.map((providerAccount) => providerAccount.toObject());
    }
}
