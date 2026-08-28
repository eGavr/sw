import { Column, Entity, ManyToOne, PrimaryColumn } from "typeorm";

import {
    CloudAccount as CloudAccountEntity,
    CloudAccountData,
} from "../../../../../../../domain/entities/cloud-account/cloud-account";
import { StereotypeData } from "../../../../../../../domain/entities/cloud-account/stereotype";
import { DateColumn } from "../../columns-extra/date-column";
import { Project } from "../project/project";

@Entity()
export class CloudAccount {
    static from(entity: CloudAccountEntity): CloudAccount {
        const data = entity.toObject();
        const cloudAccount = new CloudAccount();

        cloudAccount.id = data.id;
        cloudAccount.projectId = data.projectId;
        cloudAccount.type = data.type;
        cloudAccount.config = data.config ?? {};
        cloudAccount.credentialRef = data.credentialRef ?? null;
        cloudAccount.provides = [...data.provides];
        cloudAccount.createdAt = data.createdAt;
        cloudAccount.updatedAt = data.updatedAt;

        return cloudAccount;
    }

    @PrimaryColumn("uuid")
    id: string;

    @ManyToOne(() => Project, project => project.id)
    project: Project;

    @Column()
    projectId: string;

    @Column()
    type: string;

    @Column({ type: "jsonb", default: {} })
    config: Record<string, unknown>;

    @Column({ type: "varchar", nullable: true })
    credentialRef: string | null;

    // The (platform, execution) substrates this cloud provides — a value-object list owned by the aggregate,
    // always loaded/saved with it and never queried in SQL (routing matches it in the domain), so jsonb.
    @Column({ type: "jsonb", default: [] })
    provides: Array<StereotypeData>;

    @DateColumn()
    createdAt: Date;

    @DateColumn()
    updatedAt: Date;

    private constructor() {}

    toObject(): CloudAccountData {
        return {
            id: this.id,
            projectId: this.projectId,
            type: this.type,
            config: this.config,
            credentialRef: this.credentialRef,
            provides: this.provides,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
