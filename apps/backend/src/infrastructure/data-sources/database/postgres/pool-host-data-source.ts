import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";

import { PoolHost as HostEntity, PoolHostData } from "../../../../domain/entities/host-pool/pool-host";

import { HostPlacement } from "./typeorm/entities/host-pool/host-placement";
import { PoolHost } from "./typeorm/entities/host-pool/pool-host";

@Injectable()
export class PoolHostDataSource {
    constructor(private readonly dataSource: DataSource) {}

    async create(host: HostEntity): Promise<void> {
        const entity = PoolHost.from(host);

        await this.dataSource.transaction(async (manager) => {
            const { placements, ...row } = entity;

            await manager.getRepository(PoolHost).save(row);
            await manager.getRepository(HostPlacement).save(placements);
        });
    }

    async save(host: HostEntity): Promise<void> {
        await this.dataSource.transaction(async (manager) => {
            await this.persist(manager, host.toObject());
        });
    }

    async findOne(id: string): Promise<PoolHostData | null> {
        const host = await this.dataSource.getRepository(PoolHost).findOne({ where: { id } });

        return host?.toObject() ?? null;
    }

    // The host holding this environment's seat, if any — the release path starts from the environment.
    async findByEnvironment(environmentId: string): Promise<PoolHostData | null> {
        const placement = await this.dataSource.getRepository(HostPlacement).findOne({ where: { environmentId } });

        if (!placement) {
            return null;
        }

        return this.findOne(placement.hostId);
    }

    // Atomically read one host under a row lock, apply the caller's transition and persist it. The
    // lock serialises concurrent seat moves (place vs release vs heartbeat) on the same machine.
    async withOne(id: string, apply: (data: PoolHostData) => PoolHostData): Promise<PoolHostData | null> {
        return this.dataSource.transaction(async (manager) => {
            const locked = (await manager.query(
                "SELECT id FROM pool_host WHERE id = $1 FOR UPDATE",
                [id],
            )) as Array<{ id: string }>;

            if (locked.length === 0) {
                return null;
            }

            const entity = await manager.getRepository(PoolHost).findOneOrFail({ where: { id } });
            const next = apply(entity.toObject());

            await this.persist(manager, next);

            return next;
        });
    }

    // Atomically take the pool's fullest host that still has a free seat (in one of the given states)
    // under a row lock, and apply the caller's transition to it. Fullest-first consolidates seats onto
    // few machines so empty ones can be returned to the cloud. FOR UPDATE SKIP LOCKED lets concurrent
    // placers claim different machines without waiting; the states arrive ready from the domain.
    async withMostLoadedPlaceable(
        pool: { cloudAccountId: string; bindingId: string; states: ReadonlyArray<string> },
        apply: (data: PoolHostData) => PoolHostData,
    ): Promise<PoolHostData | null> {
        return this.dataSource.transaction(async (manager) => {
            const locked = (await manager.query(
                `SELECT id FROM pool_host
                 WHERE cloud_account_id = $1 AND binding_id = $2 AND state = ANY($3)
                   AND (SELECT count(*) FROM host_placement p WHERE p.host_id = pool_host.id) < capacity_slots
                 ORDER BY (SELECT count(*) FROM host_placement p WHERE p.host_id = pool_host.id) DESC, created_at
                 FOR UPDATE SKIP LOCKED
                 LIMIT 1`,
                [pool.cloudAccountId, pool.bindingId, pool.states],
            )) as Array<{ id: string }>;

            if (locked.length === 0) {
                return null;
            }

            const entity = await manager.getRepository(PoolHost).findOneOrFail({ where: { id: locked[0].id } });
            const next = apply(entity.toObject());

            await this.persist(manager, next);

            return next;
        });
    }

    // Hard delete; placements go with the machine via ON DELETE CASCADE.
    async delete(id: string): Promise<void> {
        await this.dataSource.getRepository(PoolHost).delete({ id });
    }

    // The aggregate and its seats persist together: host row, placement upserts, then removal of seats
    // the aggregate no longer holds — one transaction, or a partial write could strand a seat.
    private async persist(manager: EntityManager, data: PoolHostData): Promise<void> {
        await manager.getRepository(PoolHost).update(data.id, {
            state: data.state,
            hostIp: data.hostIp ?? null,
            lastSeenAt: data.lastSeenAt ?? null,
            lastEmptiedAt: data.lastEmptiedAt,
            updatedAt: data.updatedAt,
        });

        const placements = data.placements.map((placement) => HostPlacement.from(data.id, placement));

        await manager.getRepository(HostPlacement).save(placements);

        const kept = placements.map((placement) => placement.id);
        const stale = await manager.getRepository(HostPlacement).find({ where: { hostId: data.id } });

        await manager.getRepository(HostPlacement).remove(
            stale.filter((placement) => !kept.includes(placement.id)),
        );
    }
}
