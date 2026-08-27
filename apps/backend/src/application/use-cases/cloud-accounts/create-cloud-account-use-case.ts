import { Injectable } from "@nestjs/common";

import { CloudAccount, CloudConfig } from "../../../domain/entities/cloud-account/cloud-account";
import { CloudAccountList } from "../../../domain/entities/cloud-account/cloud-account-list";
import { CloudAccountOverlapError } from "../../../domain/entities/cloud-account/error/cloud-account-overlap-error";
import { InvalidArgumentError } from "../../../domain/entities/error/invalid-argument-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { CloudCatalog } from "../../interfaces/cloud-catalog";
import { CloudAccountRepository } from "../../interfaces/repositories/cloud-account-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type CreateCloudAccountInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        type: string;
        config?: CloudConfig;
    },
}

@Injectable()
export class CreateCloudAccountUseCase {
    private readonly permissionName = UserPermissionName.CloudAccount.Create;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly cloudAccountRepository: CloudAccountRepository,
        private readonly cloudCatalog: CloudCatalog,
    ) {}

    async execute({ creds, params }: CreateCloudAccountInput): Promise<CloudAccount> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        if (!this.cloudCatalog.supports(params.type)) {
            throw new InvalidArgumentError(
                `cloud type: ${params.type}: unknown (supported: ${this.cloudCatalog.types().join(", ")})`,
            );
        }

        const projectId = ProjectId.fromString(project.id);
        const cloudAccount = CloudAccount.create({
            projectId,
            type: params.type,
            provides: this.cloudCatalog.providesFor(params.type),
            config: params.config,
        });

        // Keep the project's clouds non-overlapping so every (platform, execution) resolves to one cloud.
        const active = await this.cloudAccountRepository.listActiveByProject(projectId);
        const conflict = CloudAccountList.of(active).activeConflictWith(cloudAccount);

        if (conflict) {
            throw new CloudAccountOverlapError(params.type, conflict.type);
        }

        await this.cloudAccountRepository.save(cloudAccount);

        return cloudAccount;
    }
}
