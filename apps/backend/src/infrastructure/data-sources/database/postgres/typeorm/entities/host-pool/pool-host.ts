import { Column, Entity, OneToMany, PrimaryColumn } from "typeorm";

import {
    PoolHost as PoolHostEntity,
    PoolHostData,
} from "../../../../../../../domain/entities/host-pool/pool-host";
import { DateColumn } from "../../columns-extra/date-column";

import { HostPlacement } from "./host-placement";

// One rented big machine of a binding's pool. `provider_context` remembers where it physically lives
// (opaque to us, the host provider adapter interprets it) so the machine can always be returned even
// if the binding's config changed since ordering — losing track of rented metal costs real money.
@Entity()
export class PoolHost {
    static from(host: PoolHostEntity): PoolHost {
        const data = host.toObject();
        const row = new PoolHost();

        row.id = data.id;
        row.cloudAccountId = data.cloudAccountId;
        row.bindingId = data.bindingId;
        row.state = data.state;
        row.capacitySlots = data.capacitySlots;
        row.hostIp = data.hostIp;
        row.providerContext = data.providerContext;
        row.lastSeenAt = data.lastSeenAt;
        row.lastEmptiedAt = data.lastEmptiedAt;
        row.createdAt = data.createdAt;
        row.updatedAt = data.updatedAt;
        row.placements = data.placements.map((placement) => HostPlacement.from(data.id, placement));

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
    capacitySlots: number;

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

    @OneToMany(() => HostPlacement, placement => placement.host, { eager: true })
    placements: Array<HostPlacement>;

    private constructor() {}

    toObject(): PoolHostData {
        return {
            id: this.id,
            cloudAccountId: this.cloudAccountId,
            bindingId: this.bindingId,
            state: this.state,
            capacitySlots: this.capacitySlots,
            hostIp: this.hostIp,
            providerContext: this.providerContext ?? {},
            lastSeenAt: this.lastSeenAt,
            lastEmptiedAt: this.lastEmptiedAt,
            placements: (this.placements ?? []).map((placement) => placement.toObject()),
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
