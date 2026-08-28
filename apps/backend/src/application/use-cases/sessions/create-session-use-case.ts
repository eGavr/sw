import { Injectable } from "@nestjs/common";

import { latestApplicationVersion } from "../../../domain/entities/environment/application/application-version";
import { RequestedApplication } from "../../../domain/entities/environment/application/requested-application";
import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { toExecution } from "../../../domain/entities/environment/execution";
import { defaultHeartbeatFreshnessMs } from "../../../domain/entities/environment/heartbeat-freshness";
import { SessionAllocationCriteria } from "../../../domain/entities/environment/session-allocation-criteria";
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { NoAllocatableEnvironmentError } from "../../../domain/entities/session/error/no-allocatable-environment-error";
import { Session } from "../../../domain/entities/session/session";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { WebDriverSessionGateway, WebDriverSessionOptions } from "../../interfaces/gateways/webdriver-session-gateway";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
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

// Pool allocation by default: the caller asks for an application and we pick a free, fresh, matching
// environment from the project. With sw:environmentId the session is targeted at that one environment
// instead (strict match — the domain verdict splits "can never work" from "not right now"). Either way
// the node is the real 1:1 arbiter, so the DB `busy` is only a hint — we try candidates until one
// accepts and never write to the DB here (the next agent heartbeat reports the new busy state).
@Injectable()
export class CreateSessionUseCase {
    private readonly permissionName = UserPermissionName.Session.Create;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly environmentRepository: EnvironmentRepository,
        private readonly webDriverSessionGateway: WebDriverSessionGateway,
    ) {}

    async execute({ creds, params }: CreateSessionInput): Promise<Session> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const projectId = ProjectId.fromString(project.id);

        const requested = RequestedApplication.create(params.application);
        const criteria = SessionAllocationCriteria.from({
            now: new Date(),
            freshnessMs: defaultHeartbeatFreshnessMs,
            execution: toExecution(params.execution),
            application: requested,
        });
        const candidates = params.environmentId
            ? await this.targetedCandidate(projectId, params.environmentId, criteria)
            : criteria.rank(await this.environmentRepository.findAllocatable(projectId, criteria));

        return this.allocate(candidates, requested, {
            logging: params.logging ?? false,
            video: params.video ?? false,
        });
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

    private async allocate(
        candidates: Array<Environment>,
        requested: RequestedApplication,
        options: WebDriverSessionOptions,
    ): Promise<Session> {
        for (const candidate of candidates) {
            const session = await this.tryAllocate(candidate, requested, options);

            if (session) {
                return session;
            }
        }

        throw new NoAllocatableEnvironmentError(requested.name, requested.version() ?? latestApplicationVersion);
    }

    // Opens the session with the environment's own installed application, so a "latest" request runs (and
    // reports) the concrete version the chosen environment actually offers, not the "latest" placeholder.
    private async tryAllocate(
        environment: Environment,
        requested: RequestedApplication,
        options: WebDriverSessionOptions,
    ): Promise<Session | null> {
        const application = environment.applicationFor(requested.name);

        if (!environment.endpoint || !application) {
            return null;
        }

        try {
            const webDriverSessionId = await this.webDriverSessionGateway.create(
                environment.endpoint,
                application,
                environment.platform.name,
                options,
            );

            return Session.create({
                environmentId: EnvironmentId.fromString(environment.id),
                application,
                endpoint: environment.endpoint,
                webDriverSessionId,
            });
        } catch {
            return null;
        }
    }
}
