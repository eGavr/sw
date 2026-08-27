import { Injectable } from "@nestjs/common";

import { CloudAccount } from "../../../domain/entities/cloud-account/cloud-account";
import { CloudAccountId } from "../../../domain/entities/cloud-account/cloud-account-id";
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { CloudAccountRepository } from "../../interfaces/repositories/cloud-account-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type GetCloudAccountInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        cloudAccountId: string;
    },
}

@Injectable()
export class GetCloudAccountUseCase {
    private readonly permissionName = UserPermissionName.CloudAccount.Get;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly cloudAccountRepository: CloudAccountRepository,
    ) {}

    async execute({ creds, params }: GetCloudAccountInput): Promise<CloudAccount> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const projectId = ProjectId.fromString(project.id);
        const cloudAccount = await this.cloudAccountRepository.get(CloudAccountId.fromString(params.cloudAccountId));

        // A cloud account of another project is not addressable here — don't leak its existence.
        if (!cloudAccount.belongsTo(projectId)) {
            throw new NotFoundResourceError(params.cloudAccountId);
        }

        return cloudAccount;
    }
}
