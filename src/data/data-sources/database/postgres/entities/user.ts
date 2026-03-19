import { Column, Entity, PrimaryColumn, Unique } from "typeorm";

import { UserData, User as UserEntity } from "../../../../../domain/entities/user/user";

@Entity()
@Unique(["externalId", "providerType"])
export class User {
    static from(entity: UserEntity): User {
        const user = new User();

        user.id = entity.id;
        user.externalId = entity.externalId;
        user.providerType = entity.providerType;

        return user;
    }

    @PrimaryColumn("uuid")
    id: string;

    @Column()
    externalId: string;

    @Column()
    providerType: string;

    toObject(): UserData {
        return {
            id: this.id,
            externalId: this.externalId,
            providerType: this.providerType,
        }
    }
}
