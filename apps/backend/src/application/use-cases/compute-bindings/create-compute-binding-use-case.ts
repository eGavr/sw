import { Injectable } from "@nestjs/common";

import { CloudAccount } from "../../../domain/entities/cloud-account/cloud-account";
import { CloudAccountList } from "../../../domain/entities/cloud-account/cloud-account-list";
import { ComputeBinding, ComputeBindingConfig } from "../../../domain/entities/cloud-account/compute-binding";
import { ComputeBindingConflictError } from "../../../domain/entities/cloud-account/error/compute-binding-conflict-error";
import {
    EnvironmentQuota,
    EnvironmentQuotaPolicy,
    maxEnvironmentsConfigKey,
} from "../../../domain/entities/environment/environment-quota";
import { toExecution } from "../../../domain/entities/environment/execution";
import { InvalidArgumentError } from "../../../domain/entities/error/invalid-argument-error";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { CloudCatalog, ComputeKindOffer } from "../../interfaces/cloud-catalog";
import { CloudAccountRepository } from "../../interfaces/repositories/cloud-account-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";
import { CloudAccountAccess } from "../cloud-accounts/cloud-account-access";

type CreateComputeBindingInput = {
    creds: {
        token: string;
    };
    params: {
        projectId: string;
        cloudAccountId: string;
        platformName: string;
        execution: string;
        kind: string;
        config?: ComputeBindingConfig;
    };
};

@Injectable()
export class CreateComputeBindingUseCase {
    private readonly permissionName = UserPermissionName.CloudAccount.Create;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly cloudAccountRepository: CloudAccountRepository,
        private readonly cloudCatalog: CloudCatalog,
        private readonly cloudAccountAccess: CloudAccountAccess,
        private readonly quotaPolicy: EnvironmentQuotaPolicy,
    ) {}

    async execute({ creds, params }: CreateComputeBindingInput): Promise<{ binding: ComputeBinding; account: CloudAccount }> {
        const { project, cloudAccount } = await this.cloudAccountAccess.authorize(
            creds,
            params.projectId,
            params.cloudAccountId,
            this.permissionName,
        );

        const execution = toExecution(params.execution);
        const offer = validateOffer(this.cloudCatalog, cloudAccount.type, params);

        EnvironmentQuota.validateConfigured(params.config?.[maxEnvironmentsConfigKey], this.quotaPolicy);

        // One binding per substrate ACROSS the project, or provisioning could not pick a connection.
        const connected = await this.cloudAccountRepository.listByProject(project);

        if (CloudAccountList.of(connected).isBound(params.platformName, execution)) {
            throw new ComputeBindingConflictError(params.platformName, params.execution);
        }

        const binding = cloudAccount.bindCompute({
            platformName: params.platformName,
            execution,
            kind: offer.kind,
            config: params.config,
        });

        await this.cloudAccountRepository.save(cloudAccount);

        return { binding, account: cloudAccount };
    }
}

// The requested kind must be one the catalogue offers for this substrate on this cloud, and the binding
// config must cover the kind's required keys (e.g. clusterId for kubernetes, folderId for vm) in their
// declared format — obvious garbage is refused here; whether the resource exists and access was granted
// is the probe's answer, not a create-blocker.
export function validateOffer(
    catalog: CloudCatalog,
    cloudType: string,
    params: { platformName: string; execution: string; kind: string; config?: ComputeBindingConfig },
): ComputeKindOffer {
    const substrate = catalog.substrateOffers(cloudType)
        .find((offer) => offer.stereotype.platformName === params.platformName
            && offer.stereotype.execution === params.execution);

    if (!substrate) {
        throw new InvalidArgumentError(
            `substrate: ${params.platformName}/${params.execution}: not offered by ${cloudType}`,
        );
    }

    const offer = substrate.compute.find((kindOffer) => kindOffer.kind === params.kind);

    if (!offer) {
        throw new InvalidArgumentError(
            `compute kind: ${params.kind}: not offered for ${params.platformName}/${params.execution}`
            + ` (offered: ${substrate.compute.map((kindOffer) => kindOffer.kind).join(", ")})`,
        );
    }

    const missing = offer.requiredConfig
        .filter(({ key }) => typeof params.config?.[key] !== "string" || params.config[key] === "")
        .map(({ key }) => key);

    if (missing.length > 0) {
        throw new InvalidArgumentError(`compute kind ${params.kind}: config requires: ${missing.join(", ")}`);
    }

    const malformed = offer.requiredConfig.find(
        ({ key, pattern }) => pattern && !new RegExp(pattern).test(params.config?.[key] as string),
    );

    if (malformed) {
        throw new InvalidArgumentError(
            `compute kind ${params.kind}: config.${malformed.key}: must match ${malformed.pattern}`,
        );
    }

    return offer;
}
