import { Column, Entity, PrimaryColumn, Unique } from "typeorm";

import { UserData, User as UserEntity } from "../../../../../../../domain/entities/user/user";
import { DateColumn } from "../../columns-extra/date-column";

@Entity()
@Unique(["externalId", "providerType"])
export class User {
    static from(entity: UserEntity): User {
        const user = new User();

        user.id = entity.id;
        user.externalId = entity.externalId;
        user.providerType = entity.providerType;
        user.createdAt = entity.createdAt;
        user.updatedAt = entity.updatedAt;

        return user;
    }

    @PrimaryColumn("uuid")
    id: string;

    @Column()
    externalId: string;

    @Column()
    providerType: string;

    @DateColumn()
    createdAt: Date;

    @DateColumn()
    updatedAt: Date;

    private constructor() {}

    toObject(): UserData {
        return {
            id: this.id,
            externalId: this.externalId,
            providerType: this.providerType,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        }
    }
}
