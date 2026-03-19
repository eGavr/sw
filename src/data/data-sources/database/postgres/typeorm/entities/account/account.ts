import { Column, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryColumn } from "typeorm";

import { AccountData } from "../../../../../../../domain/entities/account/account";
import { Account as AccountEntity } from "../../../../../../../domain/entities/account/account";
import { DateColumn } from "../../columns-extra/date-column";
import { User } from "../user/user";

import { AccountResourceProvider } from "./account-resource-provider";

@Entity()
export class Account {
    static from(entity: AccountEntity): Account {
        const account = new Account();

        account.id = entity.id;
        account.name = entity.name;
        account.createdAt = entity.createdAt;
        account.createdById = entity.createdBy.id;
        account.updatedAt = entity.updatedAt;

        account.resourceProvider = AccountResourceProvider.from(entity.resources);
        
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

    @OneToOne(() => AccountResourceProvider, { cascade: true, eager: true })
    @JoinColumn()
    resourceProvider: AccountResourceProvider;

    @Column()
    resourceProviderId: string;

    private constructor() {}

    toObject(): AccountData {
        return {
            id: this.id,
            name: this.name,
            createdAt: this.createdAt,
            createdBy: {
                id: this.createdBy.id,
                externalId: this.createdBy.externalId,
                providerType: this.createdBy.providerType,
                createdAt: this.createdBy.createdAt,
                updatedAt: this.createdBy.updatedAt,
            },
            updatedAt: this.updatedAt,
            resources: {
                id: this.resourceProvider.id,
                providerId: this.resourceProvider.providerId,
                providerType: this.resourceProvider.providerType,
                createdAt: this.resourceProvider.createdAt,
                updatedAt: this.resourceProvider.updatedAt,
            }, 
        }
    }
}
