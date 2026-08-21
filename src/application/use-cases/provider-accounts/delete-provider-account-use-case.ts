import { Injectable } from "@nestjs/common";

import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { ProviderAccount } from "../../../domain/entities/provider-account/provider-account";
import { ProviderAccountId } from "../../../domain/entities/provider-account/provider-account-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { ProviderAccountRepository } from "../../interfaces/repositories/provider-account-repository";
import { AccessControl } from "../../services/access-control";

type DeleteProviderAccountInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        providerAccountId: string;
    },
}

@Injectable()
export class DeleteProviderAccountUseCase {
    private readonly permissionName = UserPermissionName.ProviderAccount.Delete;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly providerAccountRepository: ProviderAccountRepository,
    ) {}

    // AIP-135 soft delete: an environment may still reference this provider account, so it is disabled
    // (retained, excluded from active routing) rather than physically removed. Returns the disabled resource.
    async execute({ creds, params }: DeleteProviderAccountInput): Promise<ProviderAccount> {
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

        providerAccount.disable();
        await this.providerAccountRepository.save(providerAccount);

        return providerAccount;
    }
}
