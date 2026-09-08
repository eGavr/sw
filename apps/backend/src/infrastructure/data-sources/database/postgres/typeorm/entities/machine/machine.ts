import { Column, Entity, Index, PrimaryColumn } from "typeorm";

import { StereotypeData } from "../../../../../../../domain/entities/cloud-account/stereotype";
import {
    Machine as MachineEntity,
    MachineData,
} from "../../../../../../../domain/entities/machine/machine";
import { MachineFactsData } from "../../../../../../../domain/entities/machine/machine-facts";
import { DateColumn } from "../../columns-extra/date-column";

// One machine of the inventory: attached by the user or ordered by us. `ready` is the aggregate's own
// word stored for the claim query (online, admitted, fit) — the domain writes it on every mutation.
// `lease_id` is unique: a machine is held by at most one lease.
@Entity()
@Index(["cloudAccountId"])
export class Machine {
    static from(machine: MachineEntity): Machine {
        const data = machine.toObject();
        const row = new Machine();

        row.id = data.id;
        row.cloudAccountId = data.cloudAccountId;
        row.origin = data.origin;
        row.fqdn = data.fqdn;
        row.provides = [...data.provides];
        row.state = data.state;
        row.admission = data.admission;
        row.facts = data.facts;
        row.slotCapacityOverride = data.slotCapacityOverride;
        row.slotCapacity = data.slotCapacity;
        row.ready = data.ready;
        row.leaseId = data.leaseId;
        row.registrationTokenHash = data.registrationTokenHash;
        row.registrationTokenExpiresAt = data.registrationTokenExpiresAt;
        row.lastSyncAt = data.lastSyncAt;
        row.createdAt = data.createdAt;
        row.updatedAt = data.updatedAt;

        return row;
    }

    @PrimaryColumn("uuid")
    id: string;

    @Column("uuid")
    cloudAccountId: string;

    @Column()
    origin: string;

    @Column({ type: "varchar", nullable: true })
    fqdn: string | null;

    @Column({ type: "jsonb", default: [] })
    provides: Array<StereotypeData>;

    @Column()
    state: string;

    @Column()
    admission: string;

    @Column({ type: "jsonb", nullable: true })
    facts: MachineFactsData | null;

    @Column({ type: "int", nullable: true })
    slotCapacityOverride: number | null;

    @Column({ type: "int", nullable: true })
    slotCapacity: number | null;

    @Column({ type: "boolean", default: false })
    ready: boolean;

    @Column({ type: "uuid", nullable: true, unique: true })
    leaseId: string | null;

    @Column({ type: "varchar", nullable: true })
    registrationTokenHash: string | null;

    @Column({ type: "timestamptz", nullable: true })
    registrationTokenExpiresAt: Date | null;

    @Column({ type: "timestamptz", nullable: true })
    lastSyncAt: Date | null;

    @DateColumn()
    createdAt: Date;

    @DateColumn()
    updatedAt: Date;

    private constructor() {}

    toObject(): MachineData {
        return {
            id: this.id,
            cloudAccountId: this.cloudAccountId,
            origin: this.origin,
            fqdn: this.fqdn,
            provides: this.provides ?? [],
            state: this.state,
            admission: this.admission,
            facts: this.facts,
            slotCapacityOverride: this.slotCapacityOverride,
            slotCapacity: this.slotCapacity,
            ready: this.ready,
            leaseId: this.leaseId,
            registrationTokenHash: this.registrationTokenHash,
            registrationTokenExpiresAt: this.registrationTokenExpiresAt,
            lastSyncAt: this.lastSyncAt,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
