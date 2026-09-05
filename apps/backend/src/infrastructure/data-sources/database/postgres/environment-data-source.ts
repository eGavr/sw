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

    // Insert the environment; with a quota claim, count-and-insert run atomically under a per-binding
    // advisory lock — concurrent creators must see each other's rows, or N of them could each pass a
    // "one seat left" check. The counted states and the limit arrive ready from the domain claim.
    async create(
        environment: EnvironmentEntity,
        quota?: {
            cloudAccountId: string;
            platformName: string;
            execution: string;
            countedStates: ReadonlyArray<string>;
            limit: number;
        },
    ): Promise<{ created: boolean; current: number }> {
        const entity = Environment.from(environment);

        return this.dataSource.transaction(async (manager) => {
            if (quota) {
                await manager.query(
                    "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
                    [quota.cloudAccountId, `${quota.platformName}:${quota.execution}`],
                );

                const [{ count }] = (await manager.query(
                    `SELECT count(*)::int AS count FROM environment
                     WHERE cloud_account_id = $1 AND platform_name = $2 AND execution = $3 AND state = ANY($4)`,
                    [quota.cloudAccountId, quota.platformName, quota.execution, quota.countedStates],
                )) as Array<{ count: number }>;

                if (count >= quota.limit) {
                    return { created: false, current: count };
                }
            }

            await manager.getRepository(Environment).save(entity);
            await manager.getRepository(EnvironmentApplication).save(entity.applications);

            return { created: true, current: 0 };
        });
    }

    async save(environment: EnvironmentEntity): Promise<void> {
        const data = environment.toObject();

        await this.dataSource.getRepository(Environment).update(data.id, {
            state: data.state,
            stateReason: data.stateReason ?? null,
            endpoint: data.endpoint ?? null,
            occupancy: data.occupancy,
            lastHeartbeatAt: data.lastHeartbeatAt ?? null,
            occupancyLastConfirmedAt: data.occupancyLastConfirmedAt ?? null,
            updatedAt: data.updatedAt,
        });
    }

    // Atomically read one environment under a row lock, apply the caller's transition and persist it.
    // The lock serialises concurrent occupancy moves (reserve vs heartbeat vs release): each transition
    // runs against the freshest row, and a domain guard that throws rolls the transaction back — that IS
    // the lost race, surfaced as the domain error.
    async withOne(
        id: string,
        apply: (data: EnvironmentData) => EnvironmentData,
    ): Promise<EnvironmentData | null> {
        return this.dataSource.transaction(async (manager) => {
            const locked = (await manager.query(
                "SELECT id FROM environment WHERE id = $1 FOR UPDATE",
                [id],
            )) as Array<{ id: string }>;

            if (locked.length === 0) {
                return null;
            }

            const entity = await manager.getRepository(Environment).findOneOrFail({ where: { id } });
            const next = apply(entity.toObject());

            await manager.getRepository(Environment).update(id, {
                state: next.state,
                stateReason: next.stateReason ?? null,
                endpoint: next.endpoint ?? null,
                occupancy: next.occupancy,
                lastHeartbeatAt: next.lastHeartbeatAt ?? null,
                occupancyLastConfirmedAt: next.occupancyLastConfirmedAt ?? null,
                updatedAt: next.updatedAt,
            });

            return next;
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
    // cutoff, optionally narrowed to (or carved around) specific compute kinds. The states, cutoffs and
    // kind split are decided upstream (the domain criteria); this only translates them into SQL — no
    // state set, freshness threshold or kind list is baked in here.
    async findByStateUpdatedBefore(
        predicates: Array<{
            state: string;
            cutoff: Date;
            computeKind?: string;
            excludeComputeKinds?: Array<string>;
        }>,
    ): Promise<Array<EnvironmentData>> {
        if (predicates.length === 0) {
            return [];
        }

        const query = this.dataSource.getRepository(Environment).createQueryBuilder("environment");

        predicates.forEach((predicate, index) => {
            let clause = `environment.state = :state${index} AND environment.updatedAt < :cutoff${index}`;
            const params: Record<string, unknown> = {
                [`state${index}`]: predicate.state,
                [`cutoff${index}`]: predicate.cutoff,
            };

            if (predicate.computeKind) {
                clause += ` AND environment.computeKind = :kind${index}`;
                params[`kind${index}`] = predicate.computeKind;
            }

            if (predicate.excludeComputeKinds && predicate.excludeComputeKinds.length > 0) {
                clause += " AND (environment.computeKind IS NULL"
                    + ` OR environment.computeKind NOT IN (:...excludedKinds${index}))`;
                params[`excludedKinds${index}`] = predicate.excludeComputeKinds;
            }

            if (index === 0) {
                query.where(`(${clause})`, params);
            } else {
                query.orWhere(`(${clause})`, params);
            }
        });

        const environments = await query.getMany();

        return environments.map((environment) => environment.toObject());
    }

    // Free environments an project may allocate a session onto, in random order. The state/busy rule,
    // freshness cutoff and the requested application (expanded into candidate names and a version
    // segment prefix) arrive ready from the domain criteria; this only translates them into SQL. A null
    // prefix means "latest" — match by name only and skip the row limit, since the newest is chosen
    // upstream and must not be capped away (the set is bounded by free inventory). The row limit is a
    // query bound for prefixed requests, not a business threshold.
    async findAllocatable(
        projectId: string,
        predicate: {
            state: string;
            occupancy: string;
            heartbeatCutoff: Date;
            execution: string;
            applicationNames: ReadonlyArray<string>;
            applicationVersionPrefix: string | null;
        },
        limit: number,
    ): Promise<Array<EnvironmentData>> {
        const idQuery = this.dataSource.getRepository(Environment)
            .createQueryBuilder("environment")
            .select("environment.id", "id")
            .where("environment.projectId = :projectId", { projectId })
            .andWhere("environment.state = :state", { state: predicate.state })
            .andWhere("environment.occupancy = :occupancy", { occupancy: predicate.occupancy })
            .andWhere("environment.execution = :execution", { execution: predicate.execution })
            .andWhere("environment.lastHeartbeatAt > :cutoff", { cutoff: predicate.heartbeatCutoff })
            .andWhere(offersApplicationSql(predicate), offersApplicationParams(predicate));

        if (predicate.applicationVersionPrefix !== null) {
            idQuery.limit(limit);
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

    // Rows matching the (occupancy, cutoff) predicate: reservations whose reservation heartbeat lapsed.
    // The occupancy value and the staleness cutoff are decided upstream (the domain criteria); this only
    // translates them into SQL.
    async findStaleReservations(
        predicate: { occupancy: string; confirmationCutoff: Date },
    ): Promise<Array<EnvironmentData>> {
        const environments = await this.dataSource.getRepository(Environment)
            .createQueryBuilder("environment")
            .where("environment.occupancy = :occupancy", { occupancy: predicate.occupancy })
            .andWhere("environment.occupancyLastConfirmedAt < :cutoff", { cutoff: predicate.confirmationCutoff })
            .getMany();

        return environments.map((environment) => environment.toObject());
    }

    // A narrow existence probe (the states/substrate/application predicate arrives ready from the
    // domain): does anything in the project match at all, regardless of being free or fresh.
    async existsOffering(
        projectId: string,
        predicate: {
            states: Array<string>;
            execution: string;
            applicationNames: ReadonlyArray<string>;
            applicationVersionPrefix: string | null;
        },
    ): Promise<boolean> {
        const query = this.dataSource.getRepository(Environment)
            .createQueryBuilder("environment")
            .select("1")
            .where("environment.projectId = :projectId", { projectId })
            .andWhere("environment.state IN (:...states)", { states: predicate.states })
            .andWhere("environment.execution = :execution", { execution: predicate.execution })
            .andWhere(offersApplicationSql(predicate), offersApplicationParams(predicate))
            .limit(1);

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

type OffersApplicationPredicate = {
    applicationNames: ReadonlyArray<string>;
    applicationVersionPrefix: string | null;
};

// The domain's "offers the requested application" clause in SQL: any candidate name, and — when the
// request carries a version prefix — a version equal to it or opening with it segment-wise
// ("140" → "140.…", never "1400.…"). A null prefix is "latest": name only.
function offersApplicationSql(predicate: OffersApplicationPredicate): string {
    const versionClause = predicate.applicationVersionPrefix === null
        ? ""
        : " AND (ea.application_version = :versionPrefix"
            + " OR ea.application_version LIKE :versionPrefixOpen ESCAPE '\\')";

    return "EXISTS (SELECT 1 FROM environment_application ea WHERE ea.environment_id = environment.id"
        + ` AND ea.application_name IN (:...applicationNames)${versionClause})`;
}

function offersApplicationParams(predicate: OffersApplicationPredicate): Record<string, unknown> {
    if (predicate.applicationVersionPrefix === null) {
        return { applicationNames: [...predicate.applicationNames] };
    }

    return {
        applicationNames: [...predicate.applicationNames],
        versionPrefix: predicate.applicationVersionPrefix,
        versionPrefixOpen: `${escapeLikePattern(predicate.applicationVersionPrefix)}.%`,
    };
}

// `_` is a LIKE wildcard and legal in versions ("1_2"); backslash is the ESCAPE character.
function escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
