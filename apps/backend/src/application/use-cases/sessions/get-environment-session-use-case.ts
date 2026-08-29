import { Injectable } from "@nestjs/common";

import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { WebDriverSessionGateway } from "../../interfaces/gateways/webdriver-session-gateway";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { SessionOwnershipRepository } from "../../interfaces/repositories/session-ownership-repository";
import { AccessControl } from "../../services/access-control";

type GetEnvironmentSessionInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        environmentId: string;
    },
}

// What the presenter needs to rebuild the capability id: the session id itself is never stored, so the
// result is reconstructed from the environment's endpoint and the node's live answer.
export type EnvironmentSession = {
    readonly endpoint: string;
    readonly webDriverSessionId: string;
};

// Recovers the live session id of an environment for the SESSION'S CREATOR — and nobody else. The id is
// a capability secret kept nowhere at rest: ownership metadata says who may ask, the node's /status is
// the source of truth for what the id currently is. Every refusal is 404 — a caller who is not the
// creator must not even learn whether a session exists.
@Injectable()
export class GetEnvironmentSessionUseCase {
    private readonly permissionName = UserPermissionName.Session.Get;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly environmentRepository: EnvironmentRepository,
        private readonly sessionOwnershipRepository: SessionOwnershipRepository,
        private readonly webDriverSessionGateway: WebDriverSessionGateway,
    ) {}

    async execute({ creds, params }: GetEnvironmentSessionInput): Promise<EnvironmentSession> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const projectId = ProjectId.fromString(project.id);
        const environment = await this.environmentRepository.findByProjectAndHandle(projectId, params.environmentId);

        if (!environment || !environment.endpoint) {
            throw new NotFoundResourceError(params.environmentId);
        }

        const ownership = await this.sessionOwnershipRepository.findByEnvironment(
            EnvironmentId.fromString(environment.id),
        );

        if (!ownership || !ownership.isOwnedBy(user.externalId)) {
            throw new NotFoundResourceError("session");
        }

        const webDriverSessionId = await this.webDriverSessionGateway.fetchCurrent(environment.endpoint);

        if (!webDriverSessionId) {
            throw new NotFoundResourceError("session");
        }

        return { endpoint: environment.endpoint, webDriverSessionId };
    }
}
