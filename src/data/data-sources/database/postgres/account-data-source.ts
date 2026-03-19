import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

import { Account as AccountEntity, AccountData } from "../../../../domain/entities/account/account";

import { Account } from "./typeorm/entities/account/account";
import { AccountUserPermission } from "./typeorm/entities/account/account-user-permission";
import { User } from "./typeorm/entities/user/user";
import { AccountUserPermissionList } from "./typeorm/entities/account/account-user-permission-list";

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
        await this.dataSource.getRepository(AccountUserPermission).save(AccountUserPermissionList.from(account))
    }
}
