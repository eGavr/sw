import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from "typeorm";

import {
    SessionOwnership as SessionOwnershipEntity,
    SessionOwnershipData,
} from "../../../../../../../domain/entities/session/session-ownership";
import { DateColumn } from "../../columns-extra/date-column";
import { Environment } from "../environment/environment";

// One row per environment (the primary key IS the environment id): who created its current session.
// Carries no secrets. The FK cascades so the row dies with the environment.
@Entity()
export class SessionOwnership {
    static from(entity: SessionOwnershipEntity): SessionOwnership {
        const data = entity.toObject();
        const ownership = new SessionOwnership();

        ownership.environmentId = data.environmentId;
        ownership.createdBy = data.createdBy;
        ownership.createdAt = data.createdAt;

        return ownership;
    }

    @PrimaryColumn("uuid")
    environmentId: string;

    @OneToOne(() => Environment, { onDelete: "CASCADE" })
    @JoinColumn({ name: "environment_id" })
    environment: Environment;

    @Column()
    createdBy: string;

    @DateColumn()
    createdAt: Date;

    private constructor() {}

    toObject(): SessionOwnershipData {
        return {
            environmentId: this.environmentId,
            createdBy: this.createdBy,
            createdAt: this.createdAt,
        };
    }
}
