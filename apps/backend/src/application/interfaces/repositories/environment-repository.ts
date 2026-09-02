import { CloudAccountId } from "../../../domain/entities/cloud-account/cloud-account-id";
import { ApplicationList } from "../../../domain/entities/environment/application/application-list";
import { CrashedExecutionCriteria } from "../../../domain/entities/environment/crashed-execution-criteria";
import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { EnvironmentState } from "../../../domain/entities/environment/environment-state";
import { Execution } from "../../../domain/entities/environment/execution";
import { GarbageCollectionCriteria } from "../../../domain/entities/environment/garbage-collection-criteria";
import { Platform } from "../../../domain/entities/environment/platform/platform";
import { SessionAllocationCriteria } from "../../../domain/entities/environment/session-allocation-criteria";
import { StaleReservationCriteria } from "../../../domain/entities/environment/stale-reservation-criteria";
import { StuckProvisioningCriteria } from "../../../domain/entities/environment/stuck-provisioning-criteria";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { Page, PageRequest } from "../../pagination";

export type CreateEnvironmentParams = {
    resourceId?: string;
    projectId: ProjectId;
    cloudAccountId?: CloudAccountId | null;
    cloudType?: string | null;
    computeKind?: string | null;
    platform: Platform;
    execution?: Execution;
    applications: ApplicationList;
};

export abstract class EnvironmentRepository {
    abstract create(params: CreateEnvironmentParams): Promise<Environment>;

    abstract get(environmentId: EnvironmentId): Promise<Environment>;

    // Resolve within a project by the identifier used in the URL — the human resource id if set, else uid.
    abstract getByProjectAndHandle(projectId: ProjectId, handle: string): Promise<Environment>;

    abstract findByProjectAndHandle(projectId: ProjectId, handle: string): Promise<Environment | null>;

    abstract listByProject(projectId: ProjectId, page: PageRequest): Promise<Page<Environment>>;

    abstract listByState(state: EnvironmentState): Promise<Array<Environment>>;

    abstract listStuckProvisioning(criteria: StuckProvisioningCriteria): Promise<Array<Environment>>;

    abstract listCrashed(criteria: CrashedExecutionCriteria): Promise<Array<Environment>>;

    abstract findAllocatable(projectId: ProjectId, criteria: SessionAllocationCriteria): Promise<Array<Environment>>;

    // Whether anything in the project could ever serve the request (offer match in any still-viable
    // state) — the narrow probe behind the retryable-vs-pointless refusal, not an aggregate load.
    abstract existsOffering(projectId: ProjectId, criteria: SessionAllocationCriteria): Promise<boolean>;

    // Reservations whose reserving wd stopped heartbeating — the sweep's work list.
    abstract listStaleReservations(criteria: StaleReservationCriteria): Promise<Array<Environment>>;

    abstract deleteCollectable(criteria: GarbageCollectionCriteria): Promise<void>;

    abstract withNextEnqueued(mutate: (environment: Environment) => void): Promise<Environment | null>;

    // Read one environment under the storage lock, run the domain transition, save atomically — the
    // occupancy protocol (reserve/occupy/release, agent heartbeats) runs through here so concurrent
    // moves serialise on the freshest row. Null when the environment is gone.
    abstract with(environmentId: EnvironmentId, mutate: (environment: Environment) => void): Promise<Environment | null>;

    abstract save(environment: Environment): Promise<void>;
}
