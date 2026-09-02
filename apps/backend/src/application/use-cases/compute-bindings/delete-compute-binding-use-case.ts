import { Injectable } from "@nestjs/common";

import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { CloudAccountRepository } from "../../interfaces/repositories/cloud-account-repository";
import { AccessControl } from "../../services/access-control";
import { CloudAccountAccess } from "../cloud-accounts/cloud-account-access";

type DeleteComputeBindingInput = {
    creds: {
        token: string;
    };
    params: {
        projectId: string;
        cloudAccountId: string;
        bindingId: string;
    };
};

// Unbinding stops NEW environments of the substrate on this connection; existing ones live out their
// lifecycle (they carry their own routing stamp).
@Injectable()
export class DeleteComputeBindingUseCase {
    private readonly permissionName = UserPermissionName.CloudAccount.Create;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly cloudAccountAccess: CloudAccountAccess,
        private readonly cloudAccountRepository: CloudAccountRepository,
    ) {}

    async execute({ creds, params }: DeleteComputeBindingInput): Promise<void> {
        const { cloudAccount } = await this.cloudAccountAccess.authorize(
            creds,
            params.projectId,
            params.cloudAccountId,
            this.permissionName,
        );

        if (!cloudAccount.unbindCompute(params.bindingId)) {
            throw new NotFoundResourceError(params.bindingId);
        }

        await this.cloudAccountRepository.save(cloudAccount);
    }
}
