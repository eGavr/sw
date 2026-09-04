import { Injectable } from "@nestjs/common";

import { CloudAccount } from "../../../domain/entities/cloud-account/cloud-account";
import { ComputeBinding, ComputeBindingConfig } from "../../../domain/entities/cloud-account/compute-binding";
import {
    EnvironmentQuota,
    EnvironmentQuotaPolicy,
    maxEnvironmentsConfigKey,
} from "../../../domain/entities/environment/environment-quota";
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { CloudCatalog } from "../../interfaces/cloud-catalog";
import { CloudAccountRepository } from "../../interfaces/repositories/cloud-account-repository";
import { AccessControl } from "../../services/access-control";
import { CloudAccountAccess } from "../cloud-accounts/cloud-account-access";

import { validateOffer } from "./create-compute-binding-use-case";

type UpdateComputeBindingInput = {
    creds: {
        token: string;
    };
    params: {
        projectId: string;
        cloudAccountId: string;
        bindingId: string;
        kind: string;
        config?: ComputeBindingConfig;
    };
};

// Re-points the binding's substrate at another kind (vm <-> kubernetes). New environments follow the new
// kind; live ones keep running on what they were provisioned with.
@Injectable()
export class UpdateComputeBindingUseCase {
    private readonly permissionName = UserPermissionName.CloudAccount.Create;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly cloudAccountAccess: CloudAccountAccess,
        private readonly cloudAccountRepository: CloudAccountRepository,
        private readonly cloudCatalog: CloudCatalog,
        private readonly quotaPolicy: EnvironmentQuotaPolicy,
    ) {}

    async execute({ creds, params }: UpdateComputeBindingInput): Promise<{ binding: ComputeBinding; account: CloudAccount }> {
        const { cloudAccount } = await this.cloudAccountAccess.authorize(
            creds,
            params.projectId,
            params.cloudAccountId,
            this.permissionName,
        );

        const existing = cloudAccount.computeBinding(params.bindingId);

        if (!existing) {
            throw new NotFoundResourceError(params.bindingId);
        }

        validateOffer(this.cloudCatalog, cloudAccount.type, {
            platformName: existing.stereotype.platformName,
            execution: existing.stereotype.execution,
            kind: params.kind,
            config: params.config,
        });

        EnvironmentQuota.validateConfigured(params.config?.[maxEnvironmentsConfigKey], this.quotaPolicy);

        const binding = cloudAccount.rebindCompute(params.bindingId, params.kind, params.config) as ComputeBinding;

        await this.cloudAccountRepository.save(cloudAccount);

        return { binding, account: cloudAccount };
    }
}
