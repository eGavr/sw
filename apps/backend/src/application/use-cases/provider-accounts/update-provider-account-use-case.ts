import { Injectable } from "@nestjs/common";

import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { ProviderAccount, ProviderConfig } from "../../../domain/entities/provider-account/provider-account";
import { ProviderAccountId } from "../../../domain/entities/provider-account/provider-account-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { ProviderAccountRepository } from "../../interfaces/repositories/provider-account-repository";
import { AccessControl } from "../../services/access-control";

type UpdateProviderAccountInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        providerAccountId: string;
        config?: ProviderConfig;
    },
}

@Injectable()
export class UpdateProviderAccountUseCase {
    private readonly permissionName = UserPermissionName.ProviderAccount.Update;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly providerAccountRepository: ProviderAccountRepository,
    ) {}

    async execute({ creds, params }: UpdateProviderAccountInput): Promise<ProviderAccount> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const projectId = ProjectId.fromString(project.id);

        const providerAccount = await this.providerAccountRepository.get(
            ProviderAccountId.fromString(params.providerAccountId),
        );

        if (!providerAccount.belongsTo(projectId)) {
            throw new NotFoundResourceError(params.providerAccountId);
        }

        if (params.config !== undefined) {
            providerAccount.updateConfig(params.config);
        }

        await this.providerAccountRepository.save(providerAccount);

        return providerAccount;
    }
}
