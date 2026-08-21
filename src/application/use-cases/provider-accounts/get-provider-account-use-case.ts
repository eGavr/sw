import { Injectable } from "@nestjs/common";

import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { ProviderAccount } from "../../../domain/entities/provider-account/provider-account";
import { ProviderAccountId } from "../../../domain/entities/provider-account/provider-account-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { ProviderAccountRepository } from "../../interfaces/repositories/provider-account-repository";
import { AccessControl } from "../../services/access-control";

type GetProviderAccountInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        providerAccountId: string;
    },
}

@Injectable()
export class GetProviderAccountUseCase {
    private readonly permissionName = UserPermissionName.ProviderAccount.Get;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly providerAccountRepository: ProviderAccountRepository,
    ) {}

    async execute({ creds, params }: GetProviderAccountInput): Promise<ProviderAccount> {
        const user = await this.accessControl.authenticate(creds);
        const projectId = ProjectId.fromString(params.projectId);
        const project = await this.projectRepository.get(projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const providerAccount = await this.providerAccountRepository.get(
            ProviderAccountId.fromString(params.providerAccountId),
        );

        // A provider account of another project is not addressable here — don't leak its existence.
        if (!providerAccount.belongsTo(projectId)) {
            throw new NotFoundResourceError(params.providerAccountId);
        }

        return providerAccount;
    }
}
