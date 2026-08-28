import { Injectable } from "@nestjs/common";

import { CloudAccountId } from "../../../domain/entities/cloud-account/cloud-account-id";
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { CloudAccountRepository } from "../../interfaces/repositories/cloud-account-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type DeleteCloudAccountInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        cloudAccountId: string;
    },
}

@Injectable()
export class DeleteCloudAccountUseCase {
    private readonly permissionName = UserPermissionName.CloudAccount.Delete;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly cloudAccountRepository: CloudAccountRepository,
    ) {}

    // A real delete: the repository refuses (CloudAccountInUseError) while environments still reference
    // the account — the caller deletes those environments first.
    async execute({ creds, params }: DeleteCloudAccountInput): Promise<void> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const projectId = ProjectId.fromString(project.id);
        const cloudAccountId = CloudAccountId.fromString(params.cloudAccountId);
        const cloudAccount = await this.cloudAccountRepository.get(cloudAccountId);

        if (!cloudAccount.belongsTo(projectId)) {
            throw new NotFoundResourceError(params.cloudAccountId);
        }

        await this.cloudAccountRepository.delete(cloudAccountId);
    }
}
