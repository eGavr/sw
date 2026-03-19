import { Column, Entity, PrimaryColumn } from "typeorm";

import { AccountResourceProvider as AccountResourceProviderEntity } from "../../../../../../../domain/entities/account/account-resource-provider";
import { DateColumn } from "../../columns-extra/date-column";

@Entity()
export class AccountResourceProvider {
    static from(entity: AccountResourceProviderEntity): AccountResourceProvider {
        const resourceProvider = new AccountResourceProvider();

        resourceProvider.id = entity.id
        resourceProvider.providerId = entity.providerId;
        resourceProvider.providerType = entity.providerType;
        resourceProvider.createdAt = entity.createdAt;
        resourceProvider.updatedAt = entity.updatedAt;

        return resourceProvider;
    }

    @PrimaryColumn("uuid")
    id: string;

    @Column()
    providerId: string;

    @Column()
    providerType: string;

    @DateColumn()
    createdAt: Date;

    @DateColumn()
    updatedAt: Date;

    private constructor() {}
}
