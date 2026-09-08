import { Column, Entity, ManyToOne, PrimaryColumn, Unique } from "typeorm";

import { SlotAssignmentData } from "../../../../../../../domain/entities/machine-pool/slot-assignment";
import { DateColumn } from "../../columns-extra/date-column";

import { MachineLease } from "./machine-lease";

// One environment's seat on a pooled host. `environment_id` is globally unique — an environment sits
// on at most one host; the FK to environment cascades so a hard-GC'd environment can never leave a
// slot permanently taken.
@Entity()
@Unique(["machineLeaseId", "slotIndex"])
export class SlotAssignment {
    static from(machineLeaseId: string, assignment: SlotAssignmentData): SlotAssignment {
        const row = new SlotAssignment();

        row.id = assignment.id;
        row.machineLeaseId = machineLeaseId;
        row.environmentId = assignment.environmentId;
        row.slotIndex = assignment.slotIndex;
        row.launch = assignment.launch ?? {};
        row.createdAt = assignment.createdAt;

        return row;
    }

    @PrimaryColumn("uuid")
    id: string;

    @ManyToOne(() => MachineLease, lease => lease.assignments, { onDelete: "CASCADE" })
    machineLease: MachineLease;

    @Column("uuid")
    machineLeaseId: string;

    @Column({ type: "uuid", unique: true })
    environmentId: string;

    @Column({ type: "int" })
    slotIndex: number;

    @Column({ type: "jsonb", default: {} })
    launch: Record<string, unknown>;

    @DateColumn()
    createdAt: Date;

    private constructor() {}

    toObject(): SlotAssignmentData {
        return {
            id: this.id,
            environmentId: this.environmentId,
            slotIndex: this.slotIndex,
            launch: this.launch ?? {},
            createdAt: this.createdAt,
        };
    }
}
