import { Column, Entity, ManyToOne, OneToMany, PrimaryColumn } from "typeorm";

import {
    CloudAccount as CloudAccountEntity,
    CloudAccountData,
} from "../../../../../../../domain/entities/cloud-account/cloud-account";
import { DateColumn } from "../../columns-extra/date-column";
import { Project } from "../project/project";

import { ComputeBinding } from "./compute-binding";

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
        cloudAccount.computeBindings = data.computeBindings.map(
            (binding) => ComputeBinding.from(data.id, binding),
        );
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

    // The per-substrate compute bindings — an owned collection of the aggregate, always loaded and saved
    // with it (the environment/applications pattern).
    @OneToMany(() => ComputeBinding, binding => binding.cloudAccount, { eager: true })
    computeBindings: Array<ComputeBinding>;

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
            computeBindings: (this.computeBindings ?? []).map((binding) => binding.toObject()),
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
