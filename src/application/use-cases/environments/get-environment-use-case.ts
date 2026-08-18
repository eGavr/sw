import { Injectable } from "@nestjs/common";

import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type GetEnvironmentInput = {
    creds: {
        token: string;
    },
    params: {
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
    ) {}

    async execute({ creds, params }: GetEnvironmentInput): Promise<Environment> {
        const user = await this.accessControl.authenticate(creds);
        const environment = await this.environmentRepository.get(EnvironmentId.fromString(params.environmentId));
        const project = await this.projectRepository.get(environment.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        return environment;
    }
}
