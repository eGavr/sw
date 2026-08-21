import { Injectable } from "@nestjs/common";

import { defaultExecution, toExecution } from "../../../domain/entities/environment/execution";
import { InvalidArgumentError } from "../../../domain/entities/error/invalid-argument-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { ProviderAccount, ProviderConfig } from "../../../domain/entities/provider-account/provider-account";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { ProviderCatalog } from "../../interfaces/provider-catalog";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { ProviderAccountRepository } from "../../interfaces/repositories/provider-account-repository";
import { AccessControl } from "../../services/access-control";

type CreateProviderAccountInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        provider: string;
        platformName: string;
        execution?: string;
        config?: ProviderConfig;
    },
}

@Injectable()
export class CreateProviderAccountUseCase {
    private readonly permissionName = UserPermissionName.ProviderAccount.Create;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly providerAccountRepository: ProviderAccountRepository,
        private readonly providerCatalog: ProviderCatalog,
    ) {}

    async execute({ creds, params }: CreateProviderAccountInput): Promise<ProviderAccount> {
        const user = await this.accessControl.authenticate(creds);
        const projectId = ProjectId.fromString(params.projectId);
        const project = await this.projectRepository.get(projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        if (!this.providerCatalog.supports(params.provider)) {
            throw new InvalidArgumentError(
                `compute provider: ${params.provider}: unknown (supported: ${this.providerCatalog.list().join(", ")})`,
            );
        }

        return this.providerAccountRepository.create({
            projectId,
            provider: params.provider,
            platformName: params.platformName,
            execution: params.execution ? toExecution(params.execution) : defaultExecution,
            config: params.config,
        });
    }
}
