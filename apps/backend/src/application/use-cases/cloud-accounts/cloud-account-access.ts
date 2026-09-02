import { Injectable } from "@nestjs/common";

import { CloudAccount } from "../../../domain/entities/cloud-account/cloud-account";
import { CloudAccountId } from "../../../domain/entities/cloud-account/cloud-account-id";
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { CloudAccountRepository } from "../../interfaces/repositories/cloud-account-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

// The shared front door of every cloud-account scenario: authenticate, authorize on the project, load
// the account and refuse to address another project's one (404 — existence is not revealed).
@Injectable()
export class CloudAccountAccess {
    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly cloudAccountRepository: CloudAccountRepository,
    ) {}

    async authorize(
        creds: { token: string },
        projectHandle: string,
        cloudAccountId: string,
        permission: UserPermissionName,
    ): Promise<{ project: ProjectId; cloudAccount: CloudAccount }> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(projectHandle);

        await this.accessControl.authorize(user, project, permission);

        const projectId = ProjectId.fromString(project.id);
        const cloudAccount = await this.cloudAccountRepository.get(CloudAccountId.fromString(cloudAccountId));

        if (!cloudAccount.belongsTo(projectId)) {
            throw new NotFoundResourceError(cloudAccountId);
        }

        return { project: projectId, cloudAccount };
    }
}
