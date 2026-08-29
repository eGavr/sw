import { Injectable } from "@nestjs/common";

import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { SessionOwnershipRepository } from "../../interfaces/repositories/session-ownership-repository";
import { Page, PageRequest } from "../../pagination";
import { AccessControl } from "../../services/access-control";

import { EnvironmentView } from "./environment-view";

type ListEnvironmentsInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        page: PageRequest;
    },
}

@Injectable()
export class ListEnvironmentsUseCase {
    private readonly permissionName = UserPermissionName.Environment.List;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly environmentRepository: EnvironmentRepository,
        private readonly sessionOwnershipRepository: SessionOwnershipRepository,
    ) {}

    async execute({ creds, params }: ListEnvironmentsInput): Promise<Page<EnvironmentView>> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const projectId = ProjectId.fromString(project.id);
        const page = await this.environmentRepository.listByProject(projectId, params.page);

        // Caller-dependent capability flag for the page: whose current sessions are the caller's own.
        const ownerships = await this.sessionOwnershipRepository.listByEnvironments(
            page.items.map((environment) => EnvironmentId.fromString(environment.id)),
        );
        const ownedEnvironmentIds = new Set(
            ownerships.filter((ownership) => ownership.isOwnedBy(user.externalId))
                .map((ownership) => ownership.environmentId),
        );

        return {
            items: page.items.map((environment) => ({
                environment,
                canAccessCurrentSession: ownedEnvironmentIds.has(environment.id),
            })),
            nextCursor: page.nextCursor,
        };
    }
}
