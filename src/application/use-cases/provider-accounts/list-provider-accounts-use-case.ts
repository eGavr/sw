import { Injectable } from "@nestjs/common";

import { ProjectId } from "../../../domain/entities/project/project-id";
import { ProviderAccount } from "../../../domain/entities/provider-account/provider-account";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { ProviderAccountRepository } from "../../interfaces/repositories/provider-account-repository";
import { AccessControl } from "../../services/access-control";

type ListProviderAccountsInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
    },
}

@Injectable()
export class ListProviderAccountsUseCase {
    private readonly permissionName = UserPermissionName.ProviderAccount.List;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly providerAccountRepository: ProviderAccountRepository,
    ) {}

    async execute({ creds, params }: ListProviderAccountsInput): Promise<Array<ProviderAccount>> {
        const user = await this.accessControl.authenticate(creds);
        const projectId = ProjectId.fromString(params.projectId);
        const project = await this.projectRepository.get(projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        return this.providerAccountRepository.listByProject(projectId);
    }
}
