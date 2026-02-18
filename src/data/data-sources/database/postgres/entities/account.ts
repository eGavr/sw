import { Column, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryColumn } from "typeorm";

import { AccountData } from "../../../../../domain/entities/account/account";
import { Account as AccountEntity } from "../../../../../domain/entities/account/account";

import { AccountResourceProvider } from "./account-resource-provider";
import { User } from "./user";

@Entity()
export class Account {
    static from(entity: AccountEntity): Account {
        const account = new Account();

        account.id = entity.id;
        account.name = entity.name;
        account.createdById = entity.createdBy.id;

        account.resourceProvider = new AccountResourceProvider();
        account.resourceProvider.providerId = entity.resources.providerId;
        account.resourceProvider.providerType = entity.resources.providerType;

        return account;
    }

    @PrimaryColumn("uuid")
    id: string;

    @Column()
    name: string;

    @ManyToOne(() => User, user => user.id, { eager: true })
    createdBy: User;

    @Column()
    createdById: string;

    @OneToOne(() => AccountResourceProvider, { cascade: true, eager: true })
    @JoinColumn()
    resourceProvider: AccountResourceProvider;

    @Column()
    resourceProviderId: string;

    toObject(): AccountData {
        return {
            id: this.id,
            name: this.name,
            createdBy: {
                id: this.createdBy.id,
                externalId: this.createdBy.externalId,
                providerType: this.createdBy.providerType,
            },
            resources: {
                providerId: this.resourceProvider.providerId,
                providerType: this.resourceProvider.providerType,
            }, 
        }
    }
}
