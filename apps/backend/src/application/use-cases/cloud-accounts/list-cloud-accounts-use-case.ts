import { Injectable } from "@nestjs/common";

import { CloudAccount } from "../../../domain/entities/cloud-account/cloud-account";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { CloudAccountRepository } from "../../interfaces/repositories/cloud-account-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type ListCloudAccountsInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
    },
}

@Injectable()
export class ListCloudAccountsUseCase {
    private readonly permissionName = UserPermissionName.CloudAccount.List;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly cloudAccountRepository: CloudAccountRepository,
    ) {}

    // AIP-135: soft-deleted (disabled) accounts are omitted from the listing — they only exist so
    // environments created before the disconnect keep their reference; get-by-id still returns them.
    async execute({ creds, params }: ListCloudAccountsInput): Promise<Array<CloudAccount>> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        return this.cloudAccountRepository.listActiveByProject(ProjectId.fromString(project.id));
    }
}
