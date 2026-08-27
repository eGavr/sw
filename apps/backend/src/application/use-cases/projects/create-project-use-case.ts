import { Injectable } from "@nestjs/common";

import { ResourceIdConflictError } from "../../../domain/entities/error/resource-id-conflict-error";
import { Project } from "../../../domain/entities/project/project";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type CreateProjectInput = {
    creds: {
        token: string;
    },
    params: {
        resourceId?: string;
        name: string;
    }
}

@Injectable()
export class CreateProjectUseCase {
    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
    ) {}

    async execute({ creds, params }: CreateProjectInput): Promise<Project> {
        const user = await this.accessControl.authenticate(creds);

        // A chosen human-readable id must be free among projects (uid-based names never collide with it).
        if (params.resourceId !== undefined && await this.projectRepository.findByHandle(params.resourceId)) {
            throw new ResourceIdConflictError(params.resourceId);
        }

        // Self-service: any authenticated user may create a project and becomes its owner with all
        // permissions (granted inside Project.create and persisted by save). No prior permission is
        // required — that was the bootstrap deadlock. Clouds are connected separately, via
        // projects/{project}/cloudAccounts.
        const project = await this.projectRepository.create({
            resourceId: params.resourceId,
            name: params.name,
            createdBy: user,
        });
        await this.projectRepository.save(project);

        return project;
    }
}
