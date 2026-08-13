import { AccountId } from "../../../domain/entities/account/account-id";
import { ApplicationList } from "../../../domain/entities/environment/application/application-list";
import { CrashedExecutionCriteria } from "../../../domain/entities/environment/crashed-execution-criteria";
import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { EnvironmentState } from "../../../domain/entities/environment/environment-state";
import { Execution } from "../../../domain/entities/environment/execution";
import { GarbageCollectionCriteria } from "../../../domain/entities/environment/garbage-collection-criteria";
import { Platform } from "../../../domain/entities/environment/platform/platform";
import { SessionAllocationCriteria } from "../../../domain/entities/environment/session-allocation-criteria";
import { StuckProvisioningCriteria } from "../../../domain/entities/environment/stuck-provisioning-criteria";
import { ProviderAccountId } from "../../../domain/entities/provider-account/provider-account-id";

export type CreateEnvironmentParams = {
    accountId: AccountId;
    providerAccountId?: ProviderAccountId | null;
    provider?: string | null;
    platform: Platform;
    execution?: Execution;
    applications: ApplicationList;
};

export abstract class EnvironmentRepository {
    abstract create(params: CreateEnvironmentParams): Promise<Environment>;

    abstract get(environmentId: EnvironmentId): Promise<Environment>;

    abstract listByAccount(accountId: AccountId): Promise<Array<Environment>>;

    abstract listByState(state: EnvironmentState): Promise<Array<Environment>>;

    abstract listStuckProvisioning(criteria: StuckProvisioningCriteria): Promise<Array<Environment>>;

    abstract listCrashed(criteria: CrashedExecutionCriteria): Promise<Array<Environment>>;

    abstract findAllocatable(accountId: AccountId, criteria: SessionAllocationCriteria): Promise<Array<Environment>>;

    abstract collectGarbage(criteria: GarbageCollectionCriteria): Promise<void>;

    abstract withNextEnqueued(mutate: (environment: Environment) => void): Promise<Environment | null>;

    abstract save(environment: Environment): Promise<void>;
}
