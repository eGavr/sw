import { Injectable } from "@nestjs/common";

import { latestApplicationVersion } from "../../../domain/entities/environment/application/application-version";
import { RequestedApplication } from "../../../domain/entities/environment/application/requested-application";
import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { toExecution } from "../../../domain/entities/environment/execution";
import { defaultHeartbeatFreshnessMs } from "../../../domain/entities/environment/heartbeat-freshness";
import { SessionAllocationCriteria } from "../../../domain/entities/environment/session-allocation-criteria";
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
        logging?: boolean;
        video?: boolean;
    },
}

// Pool allocation: the caller asks for an application, not a specific environment. We pick a free,
// fresh, matching environment from the project and open the session on its node. The node is the real
// 1:1 arbiter, so the DB `busy` is only a hint — we try candidates until one accepts and never write
// to the DB here (the next agent heartbeat reports the new busy state).
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
        const projectId = ProjectId.fromString(params.projectId);
        const project = await this.projectRepository.get(projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const requested = RequestedApplication.create(params.application);
        const criteria = SessionAllocationCriteria.from({
            now: new Date(),
            freshnessMs: defaultHeartbeatFreshnessMs,
            execution: toExecution(params.execution),
            application: requested,
        });
        const candidates = await this.environmentRepository.findAllocatable(projectId, criteria);

        return this.allocate(criteria.rank(candidates), requested, {
            logging: params.logging ?? false,
            video: params.video ?? false,
        });
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
