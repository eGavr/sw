import { Injectable } from "@nestjs/common";

import {
    CreateEnvironmentParams,
    EnvironmentRepository,
} from "../../application/interfaces/repositories/environment-repository";
import { AccountId } from "../../domain/entities/account/account-id";
import { CrashedExecutionCriteria } from "../../domain/entities/environment/crashed-execution-criteria";
import { Environment } from "../../domain/entities/environment/environment";
import { EnvironmentId } from "../../domain/entities/environment/environment-id";
import { EnvironmentState } from "../../domain/entities/environment/environment-state";
import { EnvironmentNotFoundError } from "../../domain/entities/environment/error/environment-not-found-error";
import { GarbageCollectionCriteria } from "../../domain/entities/environment/garbage-collection-criteria";
import { SessionAllocationCriteria } from "../../domain/entities/environment/session-allocation-criteria";
import { StuckProvisioningCriteria } from "../../domain/entities/environment/stuck-provisioning-criteria";
import { EnvironmentDataSource } from "../data-sources/database/postgres/environment-data-source";

// How many free candidates to fetch and try before giving up — a query bound, not a business rule.
const allocationCandidateLimit = 8;

@Injectable()
export class EnvironmentRepositoryImpl extends EnvironmentRepository {
    constructor(private readonly environmentDataSource: EnvironmentDataSource) {
        super();
    }

    async create(params: CreateEnvironmentParams): Promise<Environment> {
        const environment = Environment.create(params);

        await this.environmentDataSource.create(environment);

        return environment;
    }

    async get(environmentId: EnvironmentId): Promise<Environment> {
        const data = await this.environmentDataSource.findOne(environmentId.getValue());

        if (!data) {
            throw new EnvironmentNotFoundError(environmentId.getValue());
        }

        return Environment.fromObject(data);
    }

    async listByAccount(accountId: AccountId): Promise<Array<Environment>> {
        const data = await this.environmentDataSource.findAllByAccount(accountId.getValue());

        return data.map(Environment.fromObject);
    }

    async listByState(state: EnvironmentState): Promise<Array<Environment>> {
        const data = await this.environmentDataSource.findByState(state);

        return data.map(Environment.fromObject);
    }

    async findAllocatable(accountId: AccountId, criteria: SessionAllocationCriteria): Promise<Array<Environment>> {
        const predicate = criteria.toPredicate();

        const data = await this.environmentDataSource.findAllocatable(
            accountId.getValue(),
            {
                state: predicate.state,
                busy: predicate.busy,
                heartbeatCutoff: predicate.heartbeatCutoff,
                applicationName: predicate.applicationName,
                applicationVersion: predicate.applicationVersion,
            },
            allocationCandidateLimit,
        );

        return data.map(Environment.fromObject);
    }

    async collectGarbage(criteria: GarbageCollectionCriteria): Promise<void> {
        await this.environmentDataSource.deleteCollectable(criteria.toPredicates().map((predicate) => ({
            state: predicate.state,
            cutoff: predicate.cutoff,
            timestamp: predicate.timestamp,
            collectWhenNull: predicate.collectWhenNull,
        })));
    }

    async listStuckProvisioning(criteria: StuckProvisioningCriteria): Promise<Array<Environment>> {
        const predicates = criteria.toPredicates().map((predicate) => ({
            state: predicate.state,
            cutoff: predicate.cutoff,
        }));

        const data = await this.environmentDataSource.findByStateUpdatedBefore(predicates);

        return data.map(Environment.fromObject);
    }

    async listCrashed(criteria: CrashedExecutionCriteria): Promise<Array<Environment>> {
        const predicates = criteria.toPredicates().map((predicate) => ({
            state: predicate.state,
            cutoff: predicate.cutoff,
        }));

        const data = await this.environmentDataSource.findByStateUpdatedBefore(predicates);

        return data.map(Environment.fromObject);
    }

    // Atomically claim the next enqueued environment under a row lock and run `mutate` (the domain
    // transition, e.g. e.claim()) on it. The lock/tx are the data source's job; nothing is claimed
    // if the queue is empty (returns null).
    async withNextEnqueued(mutate: (environment: Environment) => void): Promise<Environment | null> {
        const data = await this.environmentDataSource.withNext(EnvironmentState.Enqueued, (row) => {
            const environment = Environment.fromObject(row);

            mutate(environment);

            return environment.toObject();
        });

        return data ? Environment.fromObject(data) : null;
    }

    async save(environment: Environment): Promise<void> {
        await this.environmentDataSource.save(environment);
    }
}
