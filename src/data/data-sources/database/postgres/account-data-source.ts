import { Injectable } from "@nestjs/common";
import { DataSource, In } from "typeorm";

import { Account as AccountEntity, AccountData } from "../../../../domain/entities/account/account";

import { Account } from "./typeorm/entities/account/account";
import { AccountUserPermission } from "./typeorm/entities/account/account-user-permission";
import { AccountUserPermissionList } from "./typeorm/entities/account/account-user-permission-list";
import { User } from "./typeorm/entities/user/user";

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

    async findAllByUser(userId: string): Promise<Array<AccountData>> {
        const permissions = await this.dataSource.getRepository(AccountUserPermission).find({ where: { userId } });
        const ids = [...new Set(permissions.map((permission) => permission.accountId))];

        if (ids.length === 0) {
            return [];
        }

        const accounts = await this.dataSource.getRepository(Account).find({ where: { id: In(ids) } });

        return accounts.map((account) => account.toObject());
    }

    async saveOne(account: AccountEntity): Promise<void> {
        await this.dataSource.getRepository(User).upsert(User.from(account.createdBy), ["id"]);
        await this.dataSource.getRepository(Account).save(Account.from(account));
        await this.dataSource.getRepository(AccountUserPermission).save(AccountUserPermissionList.from(account));
    }
}
