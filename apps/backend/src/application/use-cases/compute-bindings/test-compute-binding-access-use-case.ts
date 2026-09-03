import { Injectable } from "@nestjs/common";

import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { EnvironmentProviderGateway } from "../../interfaces/gateways/environment-provider-gateway";
import { CloudAccountAccess } from "../cloud-accounts/cloud-account-access";

type TestComputeBindingAccessInput = {
    creds: {
        token: string;
    };
    params: {
        projectId: string;
        cloudAccountId: string;
        bindingId: string;
    };
};

export type ComputeBindingAccessProbe = {
    readonly ok: boolean;
    readonly message?: string;
};

// Reports whether one binding is usable with its current settings: first that its resource is reachable
// under our identity (the user ran the grants), then that the resource carries this project's ownership
// marker (the user proved they control it). ok only when both hold; otherwise a message says which step
// is missing — "run the grants" vs "add the ownership label". Never throws — an unreachable/unverified
// binding is the expected answer, returned as { ok: false, message }.
@Injectable()
export class TestComputeBindingAccessUseCase {
    private readonly permissionName = UserPermissionName.CloudAccount.Get;

    constructor(
        private readonly cloudAccountAccess: CloudAccountAccess,
        private readonly environmentProviderGateway: EnvironmentProviderGateway,
    ) {}

    async execute({ creds, params }: TestComputeBindingAccessInput): Promise<ComputeBindingAccessProbe> {
        const { cloudAccount } = await this.cloudAccountAccess.authorize(
            creds,
            params.projectId,
            params.cloudAccountId,
            this.permissionName,
        );

        const binding = cloudAccount.computeBinding(params.bindingId);

        if (!binding) {
            throw new NotFoundResourceError(params.bindingId);
        }

        const reachability = await this.environmentProviderGateway.checkAccess(cloudAccount, binding);

        if (!reachability.reachable) {
            return { ok: false, message: reachability.detail };
        }

        const ownership = await this.environmentProviderGateway.verifyOwnership(cloudAccount, binding);

        return { ok: ownership.verified, message: ownership.detail };
    }
}
