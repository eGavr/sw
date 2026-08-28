import { Injectable } from "@nestjs/common";
import { DataSource, In } from "typeorm";

import { Page, PageRequest } from "../../../../application/pagination";
import { Environment as EnvironmentEntity, EnvironmentData } from "../../../../domain/entities/environment/environment";

import { Environment } from "./typeorm/entities/environment/environment";
import { EnvironmentApplication } from "./typeorm/entities/environment/environment-application";
import { keysetPage } from "./typeorm/keyset-page";

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

    // Hard-delete rows matching any of the (state, cutoff) predicates, each measured by its own
    // timestamp column (optionally counting a NULL timestamp as past the cutoff). The states, clocks
    // and cutoffs are decided upstream (the domain criteria); this only translates them into a delete.
    // Child applications are removed by the ON DELETE CASCADE foreign key.
    async deleteCollectable(
        predicates: Array<{
            state: string;
            cutoff: Date;
            timestamp: "lastHeartbeatAt" | "updatedAt";
            collectWhenNull: boolean;
        }>,
    ): Promise<void> {
        if (predicates.length === 0) {
            return;
        }

        const columns: Record<"lastHeartbeatAt" | "updatedAt", string> = {
            lastHeartbeatAt: "last_heartbeat_at",
            updatedAt: "updated_at",
        };

        const query = this.dataSource.createQueryBuilder().delete().from(Environment);

        predicates.forEach((predicate, index) => {
            const column = columns[predicate.timestamp];
            const nullClause = predicate.collectWhenNull ? ` OR ${column} IS NULL` : "";
            const clause = `(state = :state${index} AND (${column} < :cutoff${index}${nullClause}))`;
            const params = { [`state${index}`]: predicate.state, [`cutoff${index}`]: predicate.cutoff };

            if (index === 0) {
                query.where(clause, params);
            } else {
                query.orWhere(clause, params);
            }
        });

        await query.execute();
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

    // Free environments an project may allocate a session onto, in random order. The state/busy rule,
    // freshness cutoff and requested application arrive ready from the domain criteria; this only
    // translates them into SQL. A null `applicationVersion` means "latest" — match by name only and skip
    // the row limit, since the newest is chosen upstream and must not be capped away (the set is bounded
    // by free inventory). The row limit is a query bound for exact requests, not a business threshold.
    async findAllocatable(
        projectId: string,
        predicate: {
            state: string;
            busy: boolean;
            heartbeatCutoff: Date;
            execution: string;
            applicationName: string;
            applicationVersion: string | null;
        },
        limit: number,
    ): Promise<Array<EnvironmentData>> {
        const idQuery = this.dataSource.getRepository(Environment)
            .createQueryBuilder("environment")
            .select("environment.id", "id")
            .where("environment.projectId = :projectId", { projectId })
            .andWhere("environment.state = :state", { state: predicate.state })
            .andWhere("environment.busy = :busy", { busy: predicate.busy })
            .andWhere("environment.execution = :execution", { execution: predicate.execution })
            .andWhere("environment.lastHeartbeatAt > :cutoff", { cutoff: predicate.heartbeatCutoff });

        if (predicate.applicationVersion === null) {
            idQuery.andWhere(
                "EXISTS (SELECT 1 FROM environment_application ea WHERE ea.environment_id = environment.id"
                + " AND ea.application_name = :applicationName)",
                { applicationName: predicate.applicationName },
            );
        } else {
            idQuery.andWhere(
                "EXISTS (SELECT 1 FROM environment_application ea WHERE ea.environment_id = environment.id"
                + " AND ea.application_name = :applicationName AND ea.application_version = :applicationVersion)",
                { applicationName: predicate.applicationName, applicationVersion: predicate.applicationVersion },
            ).limit(limit);
        }

        const rows = await idQuery.orderBy("RANDOM()").getRawMany<{ id: string }>();
        const ids = rows.map((row) => row.id);

        if (ids.length === 0) {
            return [];
        }

        // Reload with the eager `applications` relation (QueryBuilder does not load it), preserving the
        // random order so equal-version candidates keep their load spread.
        const environments = await this.dataSource.getRepository(Environment).find({ where: { id: In(ids) } });
        const byId = new Map(environments.map((environment) => [environment.id, environment]));

        return ids.map((id) => byId.get(id)).filter((environment): environment is Environment => environment !== undefined)
            .map((environment) => environment.toObject());
    }

    // A narrow existence probe (the states/substrate/application predicate arrives ready from the
    // domain): does anything in the project match at all, regardless of being free or fresh.
    async existsOffering(
        projectId: string,
        predicate: {
            states: Array<string>;
            execution: string;
            applicationName: string;
            applicationVersion: string | null;
        },
    ): Promise<boolean> {
        const query = this.dataSource.getRepository(Environment)
            .createQueryBuilder("environment")
            .select("1")
            .where("environment.projectId = :projectId", { projectId })
            .andWhere("environment.state IN (:...states)", { states: predicate.states })
            .andWhere("environment.execution = :execution", { execution: predicate.execution })
            .limit(1);

        if (predicate.applicationVersion === null) {
            query.andWhere(
                "EXISTS (SELECT 1 FROM environment_application ea WHERE ea.environment_id = environment.id"
                + " AND ea.application_name = :applicationName)",
                { applicationName: predicate.applicationName },
            );
        } else {
            query.andWhere(
                "EXISTS (SELECT 1 FROM environment_application ea WHERE ea.environment_id = environment.id"
                + " AND ea.application_name = :applicationName AND ea.application_version = :applicationVersion)",
                { applicationName: predicate.applicationName, applicationVersion: predicate.applicationVersion },
            );
        }

        return (await query.getRawOne()) !== undefined;
    }

    async findOne(id: string): Promise<EnvironmentData | null> {
        const environment = await this.dataSource.getRepository(Environment).findOne({ where: { id } });

        return environment?.toObject() ?? null;
    }

    // Resolve an environment within a project by the identifier used in its URL: the human resource id if
    // set, else the uid. The eager `applications` relation is not auto-loaded by the query builder, so it
    // is joined explicitly. `id::text` avoids a uuid-syntax error when the handle is a human id.
    async findByProjectAndHandle(projectId: string, handle: string): Promise<EnvironmentData | null> {
        const environment = await this.dataSource.getRepository(Environment)
            .createQueryBuilder("environment")
            .leftJoinAndSelect("environment.applications", "applications")
            .where("environment.projectId = :projectId", { projectId })
            .andWhere("(environment.id::text = :handle OR environment.resourceId = :handle)", { handle })
            .getOne();

        return environment?.toObject() ?? null;
    }

    async pageByProject(projectId: string, page: PageRequest): Promise<Page<EnvironmentData>> {
        const query = this.dataSource.getRepository(Environment)
            .createQueryBuilder("environment")
            .leftJoinAndSelect("environment.applications", "applications")
            .where("environment.projectId = :projectId", { projectId });

        const { items, nextCursor } = await keysetPage(query, "environment", page);

        return { items: items.map((environment) => environment.toObject()), nextCursor };
    }
}
