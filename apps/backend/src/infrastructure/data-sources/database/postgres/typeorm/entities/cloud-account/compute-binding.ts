import { Column, Entity, ManyToOne, PrimaryColumn, Unique } from "typeorm";

import { ComputeBindingData } from "../../../../../../../domain/entities/cloud-account/compute-binding";

import { CloudAccount } from "./cloud-account";

@Entity()
@Unique(["cloudAccountId", "platformName", "execution"])
export class ComputeBinding {
    static from(cloudAccountId: string, binding: ComputeBindingData): ComputeBinding {
        const computeBinding = new ComputeBinding();

        computeBinding.id = binding.id;
        computeBinding.cloudAccountId = cloudAccountId;
        computeBinding.platformName = binding.platformName;
        computeBinding.execution = binding.execution;
        computeBinding.kind = binding.kind;
        computeBinding.config = binding.config ?? {};

        return computeBinding;
    }

    @PrimaryColumn("uuid")
    id: string;

    @ManyToOne(() => CloudAccount, cloudAccount => cloudAccount.computeBindings, { onDelete: "CASCADE" })
    cloudAccount: CloudAccount;

    @Column()
    cloudAccountId: string;

    @Column()
    platformName: string;

    @Column()
    execution: string;

    @Column()
    kind: string;

    @Column({ type: "jsonb", default: {} })
    config: Record<string, unknown>;

    private constructor() {}

    toObject(): ComputeBindingData {
        return {
            id: this.id,
            platformName: this.platformName,
            execution: this.execution,
            kind: this.kind,
            config: this.config ?? {},
        };
    }
}
