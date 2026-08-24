import { Injectable } from "@nestjs/common";

import { Application } from "../../../domain/entities/environment/application/application";
import { ApplicationList } from "../../../domain/entities/environment/application/application-list";
import { Environment } from "../../../domain/entities/environment/environment";
import { defaultExecution, toExecution } from "../../../domain/entities/environment/execution";
import { Platform } from "../../../domain/entities/environment/platform/platform";
import { ResourceIdConflictError } from "../../../domain/entities/error/resource-id-conflict-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { NoActiveProviderAccountError } from "../../../domain/entities/provider-account/error/no-active-provider-account-error";
import { ProviderAccountId } from "../../../domain/entities/provider-account/provider-account-id";
import { ProviderAccountList } from "../../../domain/entities/provider-account/provider-account-list";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { ProviderAccountRepository } from "../../interfaces/repositories/provider-account-repository";
import { AccessControl } from "../../services/access-control";

type CreateEnvironmentInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        environmentId?: string;
        platform: {
            name: string;
            version: string;
            deviceModel?: string;
        };
        execution?: string;
        applications: Array<{
            name: string;
            version: string;
        }>;
    },
}

@Injectable()
export class CreateEnvironmentUseCase {
    private readonly permissionName = UserPermissionName.Environment.Create;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly environmentRepository: EnvironmentRepository,
        private readonly providerAccountRepository: ProviderAccountRepository,
    ) {}

    async execute({ creds, params }: CreateEnvironmentInput): Promise<Environment> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const projectId = ProjectId.fromString(project.id);

        // A chosen human id must be free within the project (uid-based names never collide with it).
        if (params.environmentId !== undefined
            && await this.environmentRepository.findByProjectAndHandle(projectId, params.environmentId)) {
            throw new ResourceIdConflictError(params.environmentId);
        }

        const execution = params.execution ? toExecution(params.execution) : defaultExecution;
        const providerAccounts = await this.providerAccountRepository.listActiveByProject(projectId);
        const providerAccount = ProviderAccountList.of(providerAccounts).resolveFor(params.platform.name, execution);

        if (!providerAccount) {
            throw new NoActiveProviderAccountError(projectId.getValue());
        }

        const applications = ApplicationList.create({
            applications: params.applications.map((application) => Application.create(application)),
        });

        return this.environmentRepository.create({
            resourceId: params.environmentId,
            projectId,
            providerAccountId: ProviderAccountId.fromString(providerAccount.id),
            provider: providerAccount.provider,
            platform: Platform.fromObject(params.platform),
            execution,
            applications,
        });
    }
}
