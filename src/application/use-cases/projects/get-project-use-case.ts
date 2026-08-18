import { Injectable } from "@nestjs/common";

import { Project } from "../../../domain/entities/project/project";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type GetProjectInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
    }
}

@Injectable()
export class GetProjectUseCase {
    private readonly permissionName = UserPermissionName.Project.Get;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
    ) {}

    async execute({ creds, params }: GetProjectInput): Promise<Project> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.get(ProjectId.fromString(params.projectId));

        await this.accessControl.authorize(user, project, this.permissionName);

        return project;
    }
}
