import { Column, Entity, ManyToOne, PrimaryColumn } from "typeorm";

import {
    ProviderAccount as ProviderAccountEntity,
    ProviderAccountData,
} from "../../../../../../../domain/entities/provider-account/provider-account";
import { DateColumn } from "../../columns-extra/date-column";
import { Project } from "../project/project";

@Entity()
export class ProviderAccount {
    static from(entity: ProviderAccountEntity): ProviderAccount {
        const data = entity.toObject();
        const providerAccount = new ProviderAccount();

        providerAccount.id = data.id;
        providerAccount.projectId = data.projectId;
        providerAccount.provider = data.provider;
        providerAccount.platformName = data.platformName;
        providerAccount.execution = data.execution;
        providerAccount.config = data.config ?? {};
        providerAccount.credentialRef = data.credentialRef ?? null;
        providerAccount.state = data.state;
        providerAccount.createdAt = data.createdAt;
        providerAccount.updatedAt = data.updatedAt;

        return providerAccount;
    }

    @PrimaryColumn("uuid")
    id: string;

    @ManyToOne(() => Project, project => project.id)
    project: Project;

    @Column()
    projectId: string;

    @Column()
    provider: string;

    @Column()
    platformName: string;

    @Column()
    execution: string;

    @Column({ type: "jsonb", default: {} })
    config: Record<string, unknown>;

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
            projectId: this.projectId,
            provider: this.provider,
            platformName: this.platformName,
            execution: this.execution,
            config: this.config,
            credentialRef: this.credentialRef,
            state: this.state,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
