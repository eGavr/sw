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

// Reports whether one binding is usable with its current settings — the kind's adapter probes exactly
// what the binding names (the vm kind its folder, kubernetes its cluster) under our identity. Never
// throws on an access failure: an unreachable binding is the expected answer while the user has not run
// the grants yet, returned as { ok: false, message }.
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

        return { ok: reachability.reachable, message: reachability.detail };
    }
}
