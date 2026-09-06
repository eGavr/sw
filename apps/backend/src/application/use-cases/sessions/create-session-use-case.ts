import { Injectable } from "@nestjs/common";

import { ApplicationCatalog } from "../../../domain/entities/application-catalog/application-catalog";
import { ApplicationMatch } from "../../../domain/entities/environment/application/application-match";
import { RequestedApplication } from "../../../domain/entities/environment/application/requested-application";
import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import {
    InvalidEnvironmentOccupancyTransitionError,
} from "../../../domain/entities/environment/error/invalid-environment-occupancy-transition-error";
import {
    TargetEnvironmentNotReadyError,
} from "../../../domain/entities/environment/error/target-environment-not-ready-error";
import { toExecution } from "../../../domain/entities/environment/execution";
import { defaultHeartbeatFreshnessMs } from "../../../domain/entities/environment/heartbeat-freshness";
import { SessionAllocationCriteria } from "../../../domain/entities/environment/session-allocation-criteria";
import { ConflictError } from "../../../domain/entities/error/conflict-error";
import { InvalidArgumentError } from "../../../domain/entities/error/invalid-argument-error";
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { ensureNotCatalogProject } from "../../../domain/entities/project-application/catalog-project";
import { Session } from "../../../domain/entities/session/session";
import { SessionOwnership } from "../../../domain/entities/session/session-ownership";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { ObjectStorageGateway } from "../../interfaces/gateways/object-storage-gateway";
import { WebDriverSessionGateway, WebDriverSessionOptions } from "../../interfaces/gateways/webdriver-session-gateway";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { SessionOwnershipRepository } from "../../interfaces/repositories/session-ownership-repository";
import { StorageDestinationRepository } from "../../interfaces/repositories/storage-destination-repository";
import { AccessControl } from "../../services/access-control";
import { ApplicationCatalogLoader } from "../../services/application-catalog-loader";

// How long allocation keeps retrying a transient shortage, and how long it waits between attempts.
// The budget must cover one agent heartbeat interval so a just-freed environment is always caught:
// when a caller deletes a session and immediately asks for another, the freed environment reappears
// as free within one interval, and this retry rides over that gap instead of returning a 409 the
// caller would retry by hand. Provided by the composition root (env-tunable).
export class SessionAllocationRetry {
    constructor(readonly budgetMs: number, readonly backoffMs: number) {}
}

type CreateSessionInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        execution: string;
        application: {
            name: string;
            version?: string;
        };
        environmentId?: string;
        logging?: boolean;
        video?: boolean;
        netBridge?: boolean;
    },
}

// How often the reserving wd re-confirms its hold while the node is creating the session — the
// worker's sweep frees a reservation whose confirmation went silent (its wd died mid-create).
const reservationConfirmIntervalMs = 3_000;

// Pessimistic allocation. The caller asks for an application (or targets one environment with
// sw:environmentId) and the scenario reserves a matching free environment under the storage lock, so
// no other request can take it, then sends exactly ONE create to the node: success turns the
// reservation into busy, failure releases it and surfaces the node's real error — no create retries,
// no swallowed causes. The node's own 1:1 limit stays as the last-resort arbiter, not the allocator.
// Only the *find-and-reserve* phase retries, over a bounded budget, while the shortage is transient:
// a caller who legitimately holds capacity (freed an environment a moment ago) must get a session,
// not a 409 to retry by hand. The domain's transient(409)/permanent(400) split decides what retries.
@Injectable()
export class CreateSessionUseCase {
    private readonly permissionName = UserPermissionName.Session.Create;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly environmentRepository: EnvironmentRepository,
        private readonly sessionOwnershipRepository: SessionOwnershipRepository,
        private readonly webDriverSessionGateway: WebDriverSessionGateway,
        private readonly storageDestinationRepository: StorageDestinationRepository,
        private readonly objectStorageGateway: ObjectStorageGateway,
        private readonly retry: SessionAllocationRetry,
        private readonly applicationCatalogLoader: ApplicationCatalogLoader,
    ) {}

    async execute({ creds, params }: CreateSessionInput): Promise<Session> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        ensureNotCatalogProject(project, "creating sessions");

        const projectId = ProjectId.fromString(project.id);

        // Logging/video upload artifacts to the project's bucket under our delegated identity. Refuse
        // unless the bucket carries THIS project's ownership marker — so a project cannot make us write
        // into a bucket it merely NAMED but does not control.
        if (params.logging || params.video) {
            await this.ensureStorageOwned(projectId);
        }

        // The wire ask stays loose (an alias like `chrome`, a version prefix like `140`); the
        // project's vocabulary expands it once into the canonical names and prefix everything
        // downstream matches against.
        const catalog = await this.applicationCatalogLoader.loadFor(projectId);
        const requested = RequestedApplication.create(params.application);
        const match = catalog.expand(requested);

        const reserved = await this.reserveWithinBudget(projectId, params, requested, match);

        const session = await this.openReservedSession(reserved, catalog, match, {
            logging: params.logging ?? false,
            video: params.video ?? false,
            netBridge: params.netBridge ?? false,
        });

        // Ownership metadata (no secrets): who created the environment's current session — the upsert
        // replaces the previous session's owner. Only the creator may recover the live id later.
        await this.sessionOwnershipRepository.save(SessionOwnership.create({
            environmentId: session.environmentId,
            createdBy: user.externalId,
        }));

        return session;
    }

    // The project's storage bucket must carry this project's ownership marker before we write artifacts
    // into it — read-only proof the bucket's owner authorised this project (we never write the marker).
    private async ensureStorageOwned(projectId: ProjectId): Promise<void> {
        const destination = await this.storageDestinationRepository.find(projectId);

        if (!destination) {
            throw new InvalidArgumentError(
                "session logging/video requires a storage bucket configured for the project",
            );
        }

        if (!await this.objectStorageGateway.verifyOwnership(destination, projectId.getValue())) {
            throw new InvalidArgumentError(
                "storage bucket is not ownership-verified for this project: add its ownership marker object",
            );
        }
    }

    // Keep trying to reserve a matching environment until one is taken or the budget runs out. A
    // transient shortage (everything momentarily busy/reserved — a 409) is retried with backoff, so a
    // just-freed environment's next heartbeat lands within the budget and gets caught. A permanent
    // refusal (nothing offers the request, or an incompatible target — a 400) is thrown at once, and
    // once the budget is spent the transient 409 is finally surfaced (the pool is genuinely saturated).
    private async reserveWithinBudget(
        projectId: ProjectId,
        params: CreateSessionInput["params"],
        requested: RequestedApplication,
        match: ApplicationMatch,
    ): Promise<Environment> {
        const deadline = Date.now() + this.retry.budgetMs;

        for (;;) {
            try {
                return await this.reserveOnce(projectId, params, requested, match);
            } catch (error) {
                if (!(error instanceof ConflictError) || Date.now() >= deadline) {
                    throw error;
                }

                await this.wait(this.retry.backoffMs);
            }
        }
    }

    private async reserveOnce(
        projectId: ProjectId,
        params: CreateSessionInput["params"],
        requested: RequestedApplication,
        match: ApplicationMatch,
    ): Promise<Environment> {
        // Rebuilt each attempt so the freshness cutoff moves forward and a newly-arrived heartbeat is
        // seen. Explicitly typed so `refuseTransientShortage(): never` narrows the reserved candidate.
        const criteria: SessionAllocationCriteria = SessionAllocationCriteria.from({
            now: new Date(),
            freshnessMs: defaultHeartbeatFreshnessMs,
            execution: toExecution(params.execution),
            application: requested,
            match,
        });
        const candidates = params.environmentId
            ? await this.targetedCandidate(projectId, params.environmentId, criteria)
            : await this.poolCandidates(projectId, criteria);

        const reserved = await this.reserveFirst(candidates);

        // Every candidate was taken between listing and reserving: for a targeted request that is the
        // target's transient not-ready; for the pool it is the same transient shortage as an empty list
        // of free environments (they provably exist — they were listed a moment ago).
        if (!reserved) {
            if (params.environmentId) {
                throw new TargetEnvironmentNotReadyError(params.environmentId);
            }

            criteria.refuseTransientShortage();
        }

        return reserved;
    }

    private wait(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // An empty pool is refused with a diagnosis: the domain decides whether the shortage is transient
    // (something offers the request — retry) or pointless (nothing does — create an environment first).
    private async poolCandidates(
        projectId: ProjectId,
        criteria: SessionAllocationCriteria,
    ): Promise<Array<Environment>> {
        const candidates = await this.environmentRepository.findAllocatable(projectId, criteria);

        if (candidates.length === 0) {
            criteria.refuseAllocation(await this.environmentRepository.existsOffering(projectId, criteria));
        }

        return criteria.rank(candidates);
    }

    // sw:environmentId: the one targeted environment; the domain enforces the strict match (throws
    // incompatible-target / not-ready), the scenario only resolves the handle.
    private async targetedCandidate(
        projectId: ProjectId,
        environmentId: string,
        criteria: SessionAllocationCriteria,
    ): Promise<Array<Environment>> {
        const environment = await this.environmentRepository.findByProjectAndHandle(projectId, environmentId);

        if (!environment) {
            throw new NotFoundResourceError(environmentId);
        }

        criteria.admit(environment);

        return [environment];
    }

    // Reserve the first candidate still free under the storage lock. A lost race is the domain's
    // occupancy conflict — move on to the next candidate; a vanished row (deleted meanwhile) is
    // skipped the same way.
    private async reserveFirst(candidates: Array<Environment>): Promise<Environment | null> {
        for (const candidate of candidates) {
            try {
                const reserved = await this.environmentRepository.with(
                    EnvironmentId.fromString(candidate.id),
                    (environment) => environment.reserve(new Date()),
                );

                if (reserved) {
                    return reserved;
                }
            } catch (error) {
                if (!(error instanceof InvalidEnvironmentOccupancyTransitionError)) {
                    throw error;
                }
            }
        }

        return null;
    }

    // Exactly one create against the reserved environment's node, with the reserving wd heartbeating
    // for as long as the node takes. Success: the reservation becomes busy. Failure: the reservation is
    // released and the node's real error surfaces to the caller — a failed create must not read as
    // "no environments available".
    private async openReservedSession(
        environment: Environment,
        catalog: ApplicationCatalog,
        match: ApplicationMatch,
        options: WebDriverSessionOptions,
    ): Promise<Session> {
        const environmentId = EnvironmentId.fromString(environment.id);
        const stopHeartbeat = this.keepReservationAlive(environmentId);

        try {
            const application = environment.applicationMatching(match);

            if (!environment.endpoint || !application) {
                throw new TargetEnvironmentNotReadyError(environment.id);
            }

            // The node hears the wire vocabulary (`browserName: chrome`), not our canonical id — the
            // vocabulary translates; a custom application passes through under its own name.
            const webDriverSessionId = await this.webDriverSessionGateway.create(
                environment.endpoint,
                application,
                catalog.wireName(application.name),
                environment.platform.name,
                options,
            );

            await this.environmentRepository.with(environmentId, (reserved) => reserved.occupy());

            return Session.create({
                environmentId,
                application,
                endpoint: environment.endpoint,
                webDriverSessionId,
            });
        } catch (error) {
            await this.environmentRepository
                .with(environmentId, (reserved) => reserved.releaseReservation())
                .catch(() => undefined);

            throw error;
        } finally {
            stopHeartbeat();
        }
    }

    private keepReservationAlive(environmentId: EnvironmentId): () => void {
        const timer = setInterval(() => {
            void this.environmentRepository
                .with(environmentId, (environment) => environment.confirmReservation(new Date()))
                .catch(() => undefined);
        }, reservationConfirmIntervalMs);

        timer.unref();

        return () => clearInterval(timer);
    }
}
