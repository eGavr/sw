import { Injectable } from "@nestjs/common";

import { CloudAccount } from "../../../domain/entities/cloud-account/cloud-account";
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
        // Either address answers — the word chosen at connect or the uid — and the lookup is scoped to the
        // project, so another project's connection is simply not there (its existence is not leaked).
        const cloudAccount = await this.cloudAccountRepository.findByProjectAndHandle(projectId, params.cloudAccountId);

        if (!cloudAccount) {
            throw new NotFoundResourceError(params.cloudAccountId);
        }

        return cloudAccount;
    }
}
