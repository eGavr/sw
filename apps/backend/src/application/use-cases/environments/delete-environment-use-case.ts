import { Injectable } from "@nestjs/common";

import { Environment } from "../../../domain/entities/environment/environment";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type DeleteEnvironmentInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        environmentId: string;
    },
}

@Injectable()
export class DeleteEnvironmentUseCase {
    private readonly permissionName = UserPermissionName.Environment.Delete;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly environmentRepository: EnvironmentRepository,
    ) {}

    async execute({ creds, params }: DeleteEnvironmentInput): Promise<Environment> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const environment = await this.environmentRepository.getByProjectAndHandle(
            ProjectId.fromString(project.id),
            params.environmentId,
        );

        // Idempotent, AIP-135 soft delete: while the row exists it is returned with its lifecycle state
        // (DELETING, or DELETED once the heartbeat lapses); once GC removes the row `get` above raises
        // NOT_FOUND. `startDeletion` is a no-op if already deleting.
        environment.startDeletion();
        await this.environmentRepository.save(environment);

        return environment;
    }
}
