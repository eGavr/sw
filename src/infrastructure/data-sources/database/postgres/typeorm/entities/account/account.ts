import { Column, Entity, ManyToOne, PrimaryColumn } from "typeorm";

import { Account as AccountEntity } from "../../../../../../../domain/entities/account/account";
import { DateColumn } from "../../columns-extra/date-column";
import { User } from "../user/user";

@Entity()
export class Account {
    static from(entity: AccountEntity): Account {
        const account = new Account();

        account.id = entity.id;
        account.name = entity.name;
        account.createdAt = entity.createdAt;
        account.createdById = entity.createdBy.id;
        account.updatedAt = entity.updatedAt;

        return account;
    }

    @PrimaryColumn("uuid")
    id: string;

    @Column()
    name: string;

    @DateColumn()
    createdAt: Date;

    @ManyToOne(() => User, user => user.id, { eager: true })
    createdBy: User;

    @Column()
    createdById: string;

    @DateColumn()
    updatedAt: Date;

    private constructor() {}
}
