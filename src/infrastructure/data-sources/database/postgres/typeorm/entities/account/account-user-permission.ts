import { Column, Entity, ManyToOne, PrimaryColumn } from "typeorm";

import { AccountUserPermission as AccountUserPermissionEntity } from "../../../../../../../domain/entities/account/account-user-permission";
import { DateColumn } from "../../columns-extra/date-column";
import { User } from "../user/user";

import { Account } from "./account";

@Entity()
export class AccountUserPermission {
    static from(entity: AccountUserPermissionEntity): AccountUserPermission {
        const accountUserPermission = new AccountUserPermission();

        accountUserPermission.id = entity.id;
        accountUserPermission.accountId = entity.account.id;
        accountUserPermission.userId = entity.user.id
        accountUserPermission.createdAt = entity.createdAt;
        accountUserPermission.updatedAt = entity.updatedAt;
        accountUserPermission.name = String(entity.name);

        return accountUserPermission;
    }

    @PrimaryColumn("uuid")
    id: string;

    @ManyToOne(() => Account, accout => accout.id)
    account: Account;

    @Column()
    accountId: string;

    @ManyToOne(() => User, user => user.id)
    user: User;

    @Column()
    userId: string;

    @DateColumn()
    createdAt: Date;

    @DateColumn()
    updatedAt: Date;

    @Column()
    name: string

    private constructor() {}
}
