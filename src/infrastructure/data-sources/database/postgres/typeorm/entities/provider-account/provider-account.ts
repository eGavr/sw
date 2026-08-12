import { Column, Entity, ManyToOne, PrimaryColumn } from "typeorm";

import {
    ProviderAccount as ProviderAccountEntity,
    ProviderAccountData,
} from "../../../../../../../domain/entities/provider-account/provider-account";
import { DateColumn } from "../../columns-extra/date-column";
import { Account } from "../account/account";

@Entity()
export class ProviderAccount {
    static from(entity: ProviderAccountEntity): ProviderAccount {
        const data = entity.toObject();
        const providerAccount = new ProviderAccount();

        providerAccount.id = data.id;
        providerAccount.accountId = data.accountId;
        providerAccount.provider = data.provider;
        providerAccount.externalRef = data.externalRef ?? null;
        providerAccount.credentialRef = data.credentialRef ?? null;
        providerAccount.state = data.state;
        providerAccount.createdAt = data.createdAt;
        providerAccount.updatedAt = data.updatedAt;

        return providerAccount;
    }

    @PrimaryColumn("uuid")
    id: string;

    @ManyToOne(() => Account, account => account.id)
    account: Account;

    @Column()
    accountId: string;

    @Column()
    provider: string;

    @Column({ type: "varchar", nullable: true })
    externalRef: string | null;

    @Column({ type: "varchar", nullable: true })
    credentialRef: string | null;

    @Column()
    state: string;

    @DateColumn()
    createdAt: Date;

    @DateColumn()
    updatedAt: Date;

    private constructor() {}

    toObject(): ProviderAccountData {
        return {
            id: this.id,
            accountId: this.accountId,
            provider: this.provider,
            externalRef: this.externalRef,
            credentialRef: this.credentialRef,
            state: this.state,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
