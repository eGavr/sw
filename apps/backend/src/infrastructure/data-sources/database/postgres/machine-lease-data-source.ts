import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";

import { MachineLease as HostEntity, MachineLeaseData } from "../../../../domain/entities/machine-pool/machine-lease";
import { PoolLimits } from "../../../../domain/entities/machine-pool/pool-limits";

import { MachineLease } from "./typeorm/entities/machine-pool/machine-lease";
import { SlotAssignment } from "./typeorm/entities/machine-pool/slot-assignment";

@Injectable()
export class MachineLeaseDataSource {
    constructor(private readonly dataSource: DataSource) {}

    async create(lease: HostEntity): Promise<void> {
        const entity = MachineLease.from(lease);

        await this.dataSource.transaction(async (manager) => {
            const { assignments, ...row } = entity;

            await manager.getRepository(MachineLease).save(row);
            await manager.getRepository(SlotAssignment).save(assignments);
        });
    }

    async save(lease: HostEntity): Promise<void> {
        await this.dataSource.transaction(async (manager) => {
            await this.persist(manager, lease.toObject());
        });
    }

    async findOne(id: string): Promise<MachineLeaseData | null> {
        const lease = await this.dataSource.getRepository(MachineLease).findOne({ where: { id } });

        return lease?.toObject() ?? null;
    }

    async findAll(): Promise<Array<MachineLeaseData>> {
        const leases = await this.dataSource.getRepository(MachineLease).find();

        return leases.map((lease) => lease.toObject());
    }

    // The host holding this environment's seat, if any — the release path starts from the environment.
    async findByEnvironment(environmentId: string): Promise<MachineLeaseData | null> {
        const assignment = await this.dataSource.getRepository(SlotAssignment).findOne({ where: { environmentId } });

        if (!assignment) {
            return null;
        }

        return this.findOne(assignment.machineLeaseId);
    }

    // Atomically read one host under a row lock, apply the caller's transition and persist it. The
    // lock serialises concurrent seat moves (place vs release vs heartbeat) on the same machine.
    async withOne(id: string, apply: (data: MachineLeaseData) => MachineLeaseData): Promise<MachineLeaseData | null> {
        return this.dataSource.transaction(async (manager) => {
            const locked = (await manager.query(
                "SELECT id FROM machine_lease WHERE id = $1 FOR UPDATE",
                [id],
            )) as Array<{ id: string }>;

            if (locked.length === 0) {
                return null;
            }

            const entity = await manager.getRepository(MachineLease).findOneOrFail({ where: { id } });
            const next = apply(entity.toObject());

            await this.persist(manager, next);

            return next;
        });
    }

    // Atomically seat a workload somewhere in the pool: on the fullest host that still has a free seat
    // (fullest-first consolidates seats so empty machines can be returned), else — while the pool is
    // below its machine cap — as a brand-new row built by the caller. The whole decision runs under a
    // per-pool advisory lock taken for this transaction: machines are expensive, so concurrent placers
    // must SEE each other's outcome — without the lock two of them could each order a machine where one
    // had room for both. The candidate row lock is a plain FOR UPDATE (not SKIP LOCKED): placers are
    // already serialised by the pool lock, and a concurrent release holding the row is worth the wait.
    // The states arrive ready from the domain; the cap arrives ready from the caller's policy.
    async placeOrCreate(
        pool: { cloudAccountId: string; bindingId: string; states: ReadonlyArray<string>; environmentId: string },
        applyToExisting: (data: MachineLeaseData) => MachineLeaseData,
        buildNew: () => MachineLeaseData,
        limits: PoolLimits,
    ): Promise<{ data: MachineLeaseData; created: boolean } | null> {
        return this.dataSource.transaction(async (manager) => {
            await manager.query(
                "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
                [pool.cloudAccountId, pool.bindingId],
            );

            // The seat this environment already holds wins over any placement — checked under the lock,
            // so two placers of the same environment (the API's reservation racing the worker's
            // provisioning) can never take two seats.
            const seated = (await manager.query(
                `SELECT l.id FROM machine_lease l
                 JOIN slot_assignment a ON a.machine_lease_id = l.id
                 WHERE a.environment_id = $1 AND l.state = ANY($2)
                 FOR UPDATE OF l`,
                [pool.environmentId, pool.states],
            )) as Array<{ id: string }>;

            const candidates = seated.length > 0 ? seated : (await manager.query(
                `SELECT id FROM machine_lease
                 WHERE cloud_account_id = $1 AND binding_id = $2 AND state = ANY($3)
                   AND (SELECT count(*) FROM slot_assignment p WHERE p.machine_lease_id = machine_lease.id) < slot_capacity
                 ORDER BY (SELECT count(*) FROM slot_assignment p WHERE p.machine_lease_id = machine_lease.id) DESC, created_at
                 FOR UPDATE
                 LIMIT 1`,
                [pool.cloudAccountId, pool.bindingId, pool.states],
            )) as Array<{ id: string }>;

            if (candidates.length > 0) {
                const entity = await manager.getRepository(MachineLease).findOneOrFail({
                    where: { id: candidates[0].id },
                });
                const next = applyToExisting(entity.toObject());

                await this.persist(manager, next);

                return { data: next, created: false };
            }

            const [{ count, awaiting }] = (await manager.query(
                `SELECT count(*)::int AS count, count(*) FILTER (WHERE machine_id IS NULL)::int AS awaiting
                 FROM machine_lease WHERE cloud_account_id = $1 AND binding_id = $2`,
                [pool.cloudAccountId, pool.bindingId],
            )) as Array<{ count: number; awaiting: number }>;

            if (count >= limits.maxLeases) {
                return null;
            }
            if (limits.maxAwaitingMachine !== null && awaiting >= limits.maxAwaitingMachine) {
                return null;
            }

            const entity = MachineLease.from(HostEntity.fromObject(buildNew()));
            const { assignments, ...row } = entity;

            await manager.getRepository(MachineLease).save(row);
            await manager.getRepository(SlotAssignment).save(assignments);

            return { data: entity.toObject(), created: true };
        });
    }

    // Hard delete; assignments go with the machine via ON DELETE CASCADE.
    async delete(id: string): Promise<void> {
        await this.dataSource.getRepository(MachineLease).delete({ id });
    }

    // The aggregate and its seats persist together: host row, assignment upserts, then removal of seats
    // the aggregate no longer holds — one transaction, or a partial write could strand a seat.
    private async persist(manager: EntityManager, data: MachineLeaseData): Promise<void> {
        await manager.getRepository(MachineLease).update(data.id, {
            state: data.state,
            machineId: data.machineId,
            slotCapacity: data.slotCapacity,
            hostIp: data.hostIp ?? null,
            lastSeenAt: data.lastSeenAt ?? null,
            lastEmptiedAt: data.lastEmptiedAt,
            updatedAt: data.updatedAt,
        });

        const assignments = data.assignments.map((assignment) => SlotAssignment.from(data.id, assignment));

        await manager.getRepository(SlotAssignment).save(assignments);

        const kept = assignments.map((assignment) => assignment.id);
        const stale = await manager.getRepository(SlotAssignment).find({ where: { machineLeaseId: data.id } });

        await manager.getRepository(SlotAssignment).remove(
            stale.filter((assignment) => !kept.includes(assignment.id)),
        );
    }
}
