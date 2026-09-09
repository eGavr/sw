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
        cloudAccount.resourceId = data.resourceId ?? null;
        cloudAccount.displayName = data.displayName ?? null;
        cloudAccount.projectId = data.projectId;
        cloudAccount.type = data.type;
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

    // The human-readable id chosen at connect; unique within the project (a partial unique index, so
    // several connections may leave it unset and be addressed by uid).
    @Column({ type: "varchar", nullable: true })
    resourceId: string | null;

    @Column({ type: "varchar", nullable: true })
    displayName: string | null;

    @Column()
    projectId: string;

    @Column()
    type: string;

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
            resourceId: this.resourceId,
            displayName: this.displayName,
            projectId: this.projectId,
            type: this.type,
            credentialRef: this.credentialRef,
            computeBindings: (this.computeBindings ?? []).map((binding) => binding.toObject()),
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
