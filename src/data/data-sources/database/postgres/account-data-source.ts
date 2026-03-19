import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

import { Account as AccountEntity, AccountData } from "../../../../domain/entities/account/account";

import { Account } from "./entities/account";
import { User } from "./entities/user";

type FindOneAccountParams = {
    id: string;
}

@Injectable()
export class AccountDataSource {
    constructor(private readonly dataSource: DataSource) {}

    async findOne(params: FindOneAccountParams): Promise<AccountData | null> {
        const account = await this.dataSource.getRepository(Account).findOne({ where: params });

        return account?.toObject() ?? null;
    }

    async saveOne(account: AccountEntity): Promise<void> {
        await this.dataSource.getRepository(User).upsert(User.from(account.createdBy), ["id"]);
        await this.dataSource.getRepository(Account).save(Account.from(account));
    }
}
