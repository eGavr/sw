import { Injectable } from "@nestjs/common";

import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { SessionOwnershipRepository } from "../../interfaces/repositories/session-ownership-repository";
import { AccessControl } from "../../services/access-control";

import { EnvironmentView } from "./environment-view";

type GetEnvironmentInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        environmentId: string;
    },
}

@Injectable()
export class GetEnvironmentUseCase {
    private readonly permissionName = UserPermissionName.Environment.Get;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly environmentRepository: EnvironmentRepository,
        private readonly projectRepository: ProjectRepository,
        private readonly sessionOwnershipRepository: SessionOwnershipRepository,
    ) {}

    async execute({ creds, params }: GetEnvironmentInput): Promise<EnvironmentView> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const environment = await this.environmentRepository.getByProjectAndHandle(
            ProjectId.fromString(project.id),
            params.environmentId,
        );
        const ownership = await this.sessionOwnershipRepository.findByEnvironment(
            EnvironmentId.fromString(environment.id),
        );

        return { environment, canAccessCurrentSession: ownership?.isOwnedBy(user.externalId) ?? false };
    }
}
