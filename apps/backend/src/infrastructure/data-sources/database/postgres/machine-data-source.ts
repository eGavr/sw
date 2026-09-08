import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";

import { FreeMachinePredicate } from "../../../../domain/entities/machine/free-machine-criteria";
import { Machine as MachineEntity, MachineData } from "../../../../domain/entities/machine/machine";

import { Machine } from "./typeorm/entities/machine/machine";

// The machine inventory's persistence. The claim is the one place that must be right under
// concurrency: two pools asking for a machine at once must get two — a row lock with SKIP LOCKED makes
// each claimer skip what the other holds. The criteria arrive ready from the domain (which states,
// which stereotype); this only translates them.
@Injectable()
export class MachineDataSource {
    constructor(private readonly dataSource: DataSource) {}

    async create(machine: MachineEntity): Promise<void> {
        await this.dataSource.getRepository(Machine).save(Machine.from(machine));
    }

    async save(machine: MachineEntity): Promise<void> {
        await this.dataSource.getRepository(Machine).save(Machine.from(machine));
    }

    async findOne(id: string): Promise<MachineData | null> {
        const row = await this.dataSource.getRepository(Machine).findOne({ where: { id } });

        return row ? row.toObject() : null;
    }

    async findByLease(leaseId: string): Promise<MachineData | null> {
        const row = await this.dataSource.getRepository(Machine).findOne({ where: { leaseId } });

        return row ? row.toObject() : null;
    }

    async findByCloudAccount(cloudAccountId: string): Promise<Array<MachineData>> {
        const rows = await this.dataSource.getRepository(Machine).find({
            where: { cloudAccountId },
            order: { createdAt: "ASC" },
        });

        return rows.map((row) => row.toObject());
    }

    async findAll(): Promise<Array<MachineData>> {
        const rows = await this.dataSource.getRepository(Machine).find({ order: { createdAt: "ASC" } });

        return rows.map((row) => row.toObject());
    }

    async findLeaseIds(cloudAccountId: string): Promise<Array<string>> {
        const rows = (await this.dataSource.query(
            "SELECT lease_id FROM machine WHERE cloud_account_id = $1 AND lease_id IS NOT NULL",
            [cloudAccountId],
        )) as Array<{ lease_id: string }>;

        return rows.map((row) => row.lease_id);
    }

    async countFree(predicate: FreeMachinePredicate): Promise<number> {
        const [{ count }] = (await this.dataSource.query(
            `SELECT count(*)::int AS count FROM machine
             WHERE cloud_account_id = $1 AND ready = $2 AND lease_id IS NULL AND provides @> $3::jsonb`,
            [predicate.cloudAccountId, predicate.ready, JSON.stringify([predicate.stereotype.toObject()])],
        )) as Array<{ count: number }>;

        return count;
    }

    // The same order the claim takes machines in, so the answer is the machine a claim would get.
    async findNextFree(predicate: FreeMachinePredicate): Promise<MachineData | null> {
        const rows = (await this.dataSource.query(
            `SELECT id FROM machine
             WHERE cloud_account_id = $1 AND ready = $2 AND lease_id IS NULL AND provides @> $3::jsonb
             ORDER BY created_at
             LIMIT 1`,
            [predicate.cloudAccountId, predicate.ready, JSON.stringify([predicate.stereotype.toObject()])],
        )) as Array<{ id: string }>;

        return rows.length > 0 ? this.findOne(rows[0].id) : null;
    }

    async withOne(id: string, apply: (data: MachineData) => MachineData): Promise<MachineData | null> {
        return this.dataSource.transaction(async (manager) => {
            const locked = (await manager.query("SELECT id FROM machine WHERE id = $1 FOR UPDATE", [id])) as Array<{ id: string }>;

            if (locked.length === 0) {
                return null;
            }

            return this.applyLocked(manager, id, apply);
        });
    }

    // One free machine, locked with SKIP LOCKED so concurrent claimers each take their own; oldest
    // first, so the inventory is used evenly over time.
    async withFree(predicate: FreeMachinePredicate, apply: (data: MachineData) => MachineData): Promise<MachineData | null> {
        return this.dataSource.transaction(async (manager) => {
            const candidates = (await manager.query(
                `SELECT id FROM machine
                 WHERE cloud_account_id = $1 AND ready = $2 AND lease_id IS NULL AND provides @> $3::jsonb
                 ORDER BY created_at
                 FOR UPDATE SKIP LOCKED
                 LIMIT 1`,
                [predicate.cloudAccountId, predicate.ready, JSON.stringify([predicate.stereotype.toObject()])],
            )) as Array<{ id: string }>;

            if (candidates.length === 0) {
                return null;
            }

            return this.applyLocked(manager, candidates[0].id, apply);
        });
    }

    async delete(id: string): Promise<void> {
        await this.dataSource.getRepository(Machine).delete({ id });
    }

    private async applyLocked(
        manager: EntityManager,
        id: string,
        apply: (data: MachineData) => MachineData,
    ): Promise<MachineData> {
        const row = await manager.getRepository(Machine).findOneOrFail({ where: { id } });
        const next = apply(row.toObject());

        await manager.getRepository(Machine).save(Machine.from(MachineEntity.fromObject(next)));

        return next;
    }
}
