import { Column, Entity, OneToMany, PrimaryColumn } from "typeorm";

import {
    MachineLease as MachineLeaseEntity,
    MachineLeaseData,
} from "../../../../../../../domain/entities/machine-pool/machine-lease";
import { DateColumn } from "../../columns-extra/date-column";

import { SlotAssignment } from "./slot-assignment";

// One rented big machine of a binding's pool. `provider_context` remembers where it physically lives
// (opaque to us, the host provider adapter interprets it) so the machine can always be returned even
// if the binding's config changed since ordering — losing track of rented metal costs real money.
@Entity()
export class MachineLease {
    static from(lease: MachineLeaseEntity): MachineLease {
        const data = lease.toObject();
        const row = new MachineLease();

        row.id = data.id;
        row.cloudAccountId = data.cloudAccountId;
        row.bindingId = data.bindingId;
        row.state = data.state;
        row.slotCapacity = data.slotCapacity;
        row.hostIp = data.hostIp;
        row.providerContext = data.providerContext;
        row.lastSeenAt = data.lastSeenAt;
        row.lastEmptiedAt = data.lastEmptiedAt;
        row.createdAt = data.createdAt;
        row.updatedAt = data.updatedAt;
        row.assignments = data.assignments.map((assignment) => SlotAssignment.from(data.id, assignment));

        return row;
    }

    @PrimaryColumn("uuid")
    id: string;

    @Column("uuid")
    cloudAccountId: string;

    // No FK: a binding may be rebound/unbound while its hosts drain; the row must outlive it.
    @Column("uuid")
    bindingId: string;

    @Column()
    state: string;

    @Column({ type: "int" })
    slotCapacity: number;

    @Column({ type: "varchar", nullable: true })
    hostIp: string | null;

    @Column({ type: "jsonb", default: {} })
    providerContext: Record<string, unknown>;

    // The host agent's liveness word, refreshed by every host heartbeat; null until first check-in.
    @Column({ type: "timestamptz", nullable: true })
    lastSeenAt: Date | null;

    // When the host last became (or was born) empty — the idle sweep's clock.
    @Column({ type: "timestamptz" })
    lastEmptiedAt: Date;

    @DateColumn()
    createdAt: Date;

    @DateColumn()
    updatedAt: Date;

    @OneToMany(() => SlotAssignment, assignment => assignment.machineLease, { eager: true })
    assignments: Array<SlotAssignment>;

    private constructor() {}

    toObject(): MachineLeaseData {
        return {
            id: this.id,
            cloudAccountId: this.cloudAccountId,
            bindingId: this.bindingId,
            state: this.state,
            slotCapacity: this.slotCapacity,
            hostIp: this.hostIp,
            providerContext: this.providerContext ?? {},
            lastSeenAt: this.lastSeenAt,
            lastEmptiedAt: this.lastEmptiedAt,
            assignments: (this.assignments ?? []).map((assignment) => assignment.toObject()),
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
