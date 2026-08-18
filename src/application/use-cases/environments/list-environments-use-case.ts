import { Injectable } from "@nestjs/common";

import { Environment } from "../../../domain/entities/environment/environment";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { Page, PageRequest } from "../../pagination";
import { AccessControl } from "../../services/access-control";

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
    private readonly permissionName = UserPermissionName.Environment.Read;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly environmentRepository: EnvironmentRepository,
    ) {}

    async execute({ creds, params }: ListEnvironmentsInput): Promise<Page<Environment>> {
        const user = await this.accessControl.authenticate(creds);
        const projectId = ProjectId.fromString(params.projectId);
        const project = await this.projectRepository.get(projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        return this.environmentRepository.listByProject(projectId, params.page);
    }
}
