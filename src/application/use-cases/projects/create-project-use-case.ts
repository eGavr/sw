import { Injectable } from "@nestjs/common";

import { toExecution } from "../../../domain/entities/environment/execution";
import { InvalidArgumentError } from "../../../domain/entities/error/invalid-argument-error";
import { Project } from "../../../domain/entities/project/project";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { ProviderCatalog } from "../../interfaces/provider-catalog";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { ProviderAccountRepository } from "../../interfaces/repositories/provider-account-repository";
import { AccessControl } from "../../services/access-control";

type ComputeProvider = {
    provider: string;
    platform: string;
    execution: string;
    config?: Record<string, unknown>;
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
        private readonly providerCatalog: ProviderCatalog,
    ) {}

    async execute({ creds, params }: CreateProjectInput): Promise<Project> {
        const user = await this.accessControl.authenticate(creds);

        // Fail fast before creating anything: every requested provider must have a registered adapter,
        // else it could never be provisioned.
        for (const compute of params.compute) {
            if (!this.providerCatalog.supports(compute.provider)) {
                throw new InvalidArgumentError(
                    `compute provider: ${compute.provider}: unknown (supported: ${this.providerCatalog.list().join(", ")})`,
                );
            }
        }

        // Self-service: any authenticated user may create a project and becomes its owner with all
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
                config: compute.config,
            });
        }

        return project;
    }
}
