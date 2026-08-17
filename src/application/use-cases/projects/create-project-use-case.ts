import { Injectable } from "@nestjs/common";

import { toExecution } from "../../../domain/entities/environment/execution";
import { Project } from "../../../domain/entities/project/project";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { ProviderAccountRepository } from "../../interfaces/repositories/provider-account-repository";
import { AccessControl } from "../../services/access-control";

type ComputeProvider = {
    provider: string;
    externalRef: string;
    platform: string;
    execution: string;
};

type CreateProjectInput = {
    creds: {
        token: string;
    },
    params: {
        name: string;
        compute: Array<ComputeProvider>;
    }
}

@Injectable()
export class CreateProjectUseCase {
    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly providerAccountRepository: ProviderAccountRepository,
    ) {}

    async execute({ creds, params }: CreateProjectInput): Promise<Project> {
        const user = await this.accessControl.authenticate(creds);

        // Self-service: any authenticated user may create an project and becomes its owner with all
        // permissions (granted inside Project.create and persisted by save). No prior permission is
        // required — that was the bootstrap deadlock (needing Project.Create before any project exists).
        const project = await this.projectRepository.create({ name: params.name, createdBy: user });
        await this.projectRepository.save(project);

        const projectId = ProjectId.fromString(project.id);

        for (const compute of params.compute) {
            await this.providerAccountRepository.create({
                projectId,
                provider: compute.provider,
                platformName: compute.platform,
                execution: toExecution(compute.execution),
                externalRef: compute.externalRef,
            });
        }

        return project;
    }
}
