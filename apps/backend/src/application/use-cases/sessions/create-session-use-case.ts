import { Injectable } from "@nestjs/common";

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
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { Session } from "../../../domain/entities/session/session";
import { SessionOwnership } from "../../../domain/entities/session/session-ownership";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { WebDriverSessionGateway, WebDriverSessionOptions } from "../../interfaces/gateways/webdriver-session-gateway";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { SessionOwnershipRepository } from "../../interfaces/repositories/session-ownership-repository";
import { AccessControl } from "../../services/access-control";

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
    },
}

// How often the reserving wd re-confirms its hold while the node is creating the session — the
// worker's sweep frees a reservation whose confirmation went silent (its wd died mid-create).
const reservationConfirmIntervalMs = 3_000;

// Pessimistic allocation. The caller asks for an application (or targets one environment with
// sw:environmentId) and the scenario reserves a matching free environment under the storage lock, so
// no other request can take it, then sends exactly ONE create to the node: success turns the
// reservation into busy, failure releases it and surfaces the node's real error — no retries, no
// swallowed causes. The node's own 1:1 limit stays as the last-resort arbiter, not the allocator.
@Injectable()
export class CreateSessionUseCase {
    private readonly permissionName = UserPermissionName.Session.Create;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly environmentRepository: EnvironmentRepository,
        private readonly sessionOwnershipRepository: SessionOwnershipRepository,
        private readonly webDriverSessionGateway: WebDriverSessionGateway,
    ) {}

    async execute({ creds, params }: CreateSessionInput): Promise<Session> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const projectId = ProjectId.fromString(project.id);

        const requested = RequestedApplication.create(params.application);
        // Explicitly typed so `refuseTransientShortage(): never` narrows the reserved candidate below
        // (TS only honours never-returning calls on explicitly annotated references).
        const criteria: SessionAllocationCriteria = SessionAllocationCriteria.from({
            now: new Date(),
            freshnessMs: defaultHeartbeatFreshnessMs,
            execution: toExecution(params.execution),
            application: requested,
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

        const session = await this.openReservedSession(reserved, requested, {
            logging: params.logging ?? false,
            video: params.video ?? false,
        });

        // Ownership metadata (no secrets): who created the environment's current session — the upsert
        // replaces the previous session's owner. Only the creator may recover the live id later.
        await this.sessionOwnershipRepository.save(SessionOwnership.create({
            environmentId: session.environmentId,
            createdBy: user.externalId,
        }));

        return session;
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
        requested: RequestedApplication,
        options: WebDriverSessionOptions,
    ): Promise<Session> {
        const environmentId = EnvironmentId.fromString(environment.id);
        const stopHeartbeat = this.keepReservationAlive(environmentId);

        try {
            const application = environment.applicationFor(requested.name);

            if (!environment.endpoint || !application) {
                throw new TargetEnvironmentNotReadyError(environment.id);
            }

            const webDriverSessionId = await this.webDriverSessionGateway.create(
                environment.endpoint,
                application,
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
