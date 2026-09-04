import { Injectable } from "@nestjs/common";

import {
    CreateEnvironmentParams,
    EnvironmentRepository,
} from "../../application/interfaces/repositories/environment-repository";
import { Page, PageRequest } from "../../application/pagination";
import { CrashedExecutionCriteria } from "../../domain/entities/environment/crashed-execution-criteria";
import { Environment } from "../../domain/entities/environment/environment";
import { EnvironmentId } from "../../domain/entities/environment/environment-id";
import { EnvironmentQuotaClaim } from "../../domain/entities/environment/environment-quota";
import { EnvironmentState } from "../../domain/entities/environment/environment-state";
import { EnvironmentNotFoundError } from "../../domain/entities/environment/error/environment-not-found-error";
import {
    EnvironmentQuotaExceededError,
} from "../../domain/entities/environment/error/environment-quota-exceeded-error";
import { GarbageCollectionCriteria } from "../../domain/entities/environment/garbage-collection-criteria";
import { SessionAllocationCriteria } from "../../domain/entities/environment/session-allocation-criteria";
import { StaleReservationCriteria } from "../../domain/entities/environment/stale-reservation-criteria";
import { StuckProvisioningCriteria } from "../../domain/entities/environment/stuck-provisioning-criteria";
import { ProjectId } from "../../domain/entities/project/project-id";
import { EnvironmentDataSource } from "../data-sources/database/postgres/environment-data-source";

// How many free candidates to fetch and try before giving up — a query bound, not a business rule.
const allocationCandidateLimit = 8;

@Injectable()
export class EnvironmentRepositoryImpl extends EnvironmentRepository {
    constructor(private readonly environmentDataSource: EnvironmentDataSource) {
        super();
    }

    async create(params: CreateEnvironmentParams, quota?: EnvironmentQuotaClaim): Promise<Environment> {
        const environment = Environment.create(params);

        const result = await this.environmentDataSource.create(
            environment,
            quota && {
                cloudAccountId: quota.cloudAccountId,
                platformName: quota.platformName,
                execution: quota.execution,
                countedStates: quota.countedStates,
                limit: quota.limit,
            },
        );

        if (!result.created) {
            throw new EnvironmentQuotaExceededError(result.current, quota?.limit ?? 0);
        }

        return environment;
    }

    async get(environmentId: EnvironmentId): Promise<Environment> {
        const data = await this.environmentDataSource.findOne(environmentId.getValue());

        if (!data) {
            throw new EnvironmentNotFoundError(environmentId.getValue());
        }

        return Environment.fromObject(data);
    }

    async getByProjectAndHandle(projectId: ProjectId, handle: string): Promise<Environment> {
        const environment = await this.findByProjectAndHandle(projectId, handle);

        if (!environment) {
            throw new EnvironmentNotFoundError(handle);
        }

        return environment;
    }

    async findByProjectAndHandle(projectId: ProjectId, handle: string): Promise<Environment | null> {
        const data = await this.environmentDataSource.findByProjectAndHandle(projectId.getValue(), handle);

        return data ? Environment.fromObject(data) : null;
    }

    async listByProject(projectId: ProjectId, page: PageRequest): Promise<Page<Environment>> {
        const result = await this.environmentDataSource.pageByProject(projectId.getValue(), page);

        return { items: result.items.map(Environment.fromObject), nextCursor: result.nextCursor };
    }

    async listByState(state: EnvironmentState): Promise<Array<Environment>> {
        const data = await this.environmentDataSource.findByState(state);

        return data.map(Environment.fromObject);
    }

    async findAllocatable(projectId: ProjectId, criteria: SessionAllocationCriteria): Promise<Array<Environment>> {
        const predicate = criteria.toPredicate();

        const data = await this.environmentDataSource.findAllocatable(
            projectId.getValue(),
            {
                state: predicate.state,
                occupancy: predicate.occupancy,
                heartbeatCutoff: predicate.heartbeatCutoff,
                execution: predicate.execution,
                applicationName: predicate.applicationName,
                applicationVersion: predicate.applicationVersion,
            },
            allocationCandidateLimit,
        );

        return data.map(Environment.fromObject);
    }

    async listStaleReservations(criteria: StaleReservationCriteria): Promise<Array<Environment>> {
        const predicate = criteria.toPredicate();

        const data = await this.environmentDataSource.findStaleReservations({
            occupancy: predicate.occupancy,
            confirmationCutoff: predicate.confirmationCutoff,
        });

        return data.map(Environment.fromObject);
    }

    async existsOffering(projectId: ProjectId, criteria: SessionAllocationCriteria): Promise<boolean> {
        const predicate = criteria.toOfferPredicate();

        return this.environmentDataSource.existsOffering(projectId.getValue(), {
            states: [...predicate.states],
            execution: predicate.execution,
            applicationName: predicate.applicationName,
            applicationVersion: predicate.applicationVersion,
        });
    }

    async deleteCollectable(criteria: GarbageCollectionCriteria): Promise<void> {
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
            computeKind: predicate.computeKind,
            excludeComputeKinds: predicate.excludeComputeKinds ? [...predicate.excludeComputeKinds] : undefined,
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

    async with(environmentId: EnvironmentId, mutate: (environment: Environment) => void): Promise<Environment | null> {
        const data = await this.environmentDataSource.withOne(environmentId.getValue(), (row) => {
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
