import { Injectable } from "@nestjs/common";

import { CloudAccountId } from "../../../domain/entities/cloud-account/cloud-account-id";
import { CloudAccountList } from "../../../domain/entities/cloud-account/cloud-account-list";
import { NoActiveCloudAccountError } from "../../../domain/entities/cloud-account/error/no-active-cloud-account-error";
import { Application } from "../../../domain/entities/environment/application/application";
import { ApplicationList } from "../../../domain/entities/environment/application/application-list";
import { Environment } from "../../../domain/entities/environment/environment";
import { defaultExecution, toExecution } from "../../../domain/entities/environment/execution";
import { Platform } from "../../../domain/entities/environment/platform/platform";
import { ResourceIdConflictError } from "../../../domain/entities/error/resource-id-conflict-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { CloudAccountRepository } from "../../interfaces/repositories/cloud-account-repository";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
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
        private readonly cloudAccountRepository: CloudAccountRepository,
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
        const cloudAccounts = await this.cloudAccountRepository.listByProject(projectId);
        const cloudAccount = CloudAccountList.of(cloudAccounts).resolveFor(params.platform.name, execution);

        if (!cloudAccount) {
            throw new NoActiveCloudAccountError(projectId.getValue());
        }

        const applications = ApplicationList.create({
            applications: params.applications.map((application) => Application.create(application)),
        });

        return this.environmentRepository.create({
            resourceId: params.environmentId,
            projectId,
            cloudAccountId: CloudAccountId.fromString(cloudAccount.id),
            cloudType: cloudAccount.type,
            platform: Platform.fromObject(params.platform),
            execution,
            applications,
        });
    }
}
