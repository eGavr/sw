import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

import { Environment as EnvironmentEntity, EnvironmentData } from "../../../../domain/entities/environment/environment";

import { Environment } from "./typeorm/entities/environment/environment";
import { EnvironmentApplication } from "./typeorm/entities/environment/environment-application";

@Injectable()
export class EnvironmentDataSource {
    constructor(private readonly dataSource: DataSource) {}

    async create(environment: EnvironmentEntity): Promise<void> {
        const entity = Environment.from(environment);

        await this.dataSource.transaction(async (manager) => {
            await manager.getRepository(Environment).save(entity);
            await manager.getRepository(EnvironmentApplication).save(entity.applications);
        });
    }

    async save(environment: EnvironmentEntity): Promise<void> {
        const data = environment.toObject();

        await this.dataSource.getRepository(Environment).update(data.id, {
            state: data.state,
            stateReason: data.stateReason ?? null,
            endpoint: data.endpoint ?? null,
            busy: data.busy,
            lastHeartbeatAt: data.lastHeartbeatAt ?? null,
            updatedAt: data.updatedAt,
        });
    }

    // Atomically take the next environment in `state` (oldest first) under a row lock and apply the
    // caller's transition to it. FOR UPDATE SKIP LOCKED lets N workers claim different rows without
    // waiting or deadlocking; the transition itself is a domain method run inside `apply`.
    async withNext(
        state: string,
        apply: (data: EnvironmentData) => EnvironmentData,
    ): Promise<EnvironmentData | null> {
        return this.dataSource.transaction(async (manager) => {
            const locked = (await manager.query(
                "SELECT id FROM environment WHERE state = $1 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
                [state],
            )) as Array<{ id: string }>;

            if (locked.length === 0) {
                return null;
            }

            const { id } = locked[0];
            const entity = await manager.getRepository(Environment).findOneOrFail({ where: { id } });
            const next = apply(entity.toObject());

            await manager.getRepository(Environment).update(id, {
                state: next.state,
                attempts: () => "attempts + 1",
                updatedAt: next.updatedAt,
            });

            return next;
        });
    }

    async findByState(state: string): Promise<Array<EnvironmentData>> {
        const environments = await this.dataSource.getRepository(Environment).find({ where: { state } });

        return environments.map((environment) => environment.toObject());
    }

    // Rows matching any of the (state, cutoff) predicates: in that state and last touched before its
    // cutoff. The states and cutoffs are decided upstream (the domain criteria); this only translates
    // them into SQL — no state set or freshness threshold is baked in here.
    async findByStateUpdatedBefore(predicates: Array<{ state: string; cutoff: Date }>): Promise<Array<EnvironmentData>> {
        if (predicates.length === 0) {
            return [];
        }

        const query = this.dataSource.getRepository(Environment).createQueryBuilder("environment");

        predicates.forEach((predicate, index) => {
            const clause = `environment.state = :state${index} AND environment.updatedAt < :cutoff${index}`;
            const params = { [`state${index}`]: predicate.state, [`cutoff${index}`]: predicate.cutoff };

            if (index === 0) {
                query.where(clause, params);
            } else {
                query.orWhere(clause, params);
            }
        });

        const environments = await query.getMany();

        return environments.map((environment) => environment.toObject());
    }

    async findOne(id: string): Promise<EnvironmentData | null> {
        const environment = await this.dataSource.getRepository(Environment).findOne({ where: { id } });

        return environment?.toObject() ?? null;
    }

    async findAllByAccount(accountId: string): Promise<Array<EnvironmentData>> {
        const environments = await this.dataSource.getRepository(Environment).find({ where: { accountId } });

        return environments.map((environment) => environment.toObject());
    }
}
