import { Column, Entity, ManyToOne, PrimaryColumn, Unique } from "typeorm";

import { HostPlacementData } from "../../../../../../../domain/entities/host-pool/host-placement";
import { DateColumn } from "../../columns-extra/date-column";

import { PoolHost } from "./pool-host";

// One environment's seat on a pooled host. `environment_id` is globally unique — an environment sits
// on at most one host; the FK to environment cascades so a hard-GC'd environment can never leave a
// slot permanently taken.
@Entity()
@Unique(["hostId", "slotIndex"])
export class HostPlacement {
    static from(hostId: string, placement: HostPlacementData): HostPlacement {
        const row = new HostPlacement();

        row.id = placement.id;
        row.hostId = hostId;
        row.environmentId = placement.environmentId;
        row.slotIndex = placement.slotIndex;
        row.launch = placement.launch ?? {};
        row.createdAt = placement.createdAt;

        return row;
    }

    @PrimaryColumn("uuid")
    id: string;

    @ManyToOne(() => PoolHost, host => host.placements, { onDelete: "CASCADE" })
    host: PoolHost;

    @Column("uuid")
    hostId: string;

    @Column({ type: "uuid", unique: true })
    environmentId: string;

    @Column({ type: "int" })
    slotIndex: number;

    @Column({ type: "jsonb", default: {} })
    launch: Record<string, unknown>;

    @DateColumn()
    createdAt: Date;

    private constructor() {}

    toObject(): HostPlacementData {
        return {
            id: this.id,
            environmentId: this.environmentId,
            slotIndex: this.slotIndex,
            launch: this.launch ?? {},
            createdAt: this.createdAt,
        };
    }
}
