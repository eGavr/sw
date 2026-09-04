import {
    CloudReachability,
    EnvironmentProviderGateway,
    OwnershipVerification,
} from "../../../../application/interfaces/gateways/environment-provider-gateway";
import { HostProviderGateway } from "../../../../application/interfaces/gateways/host-provider-gateway";
import { PlaceWorkloadUseCase } from "../../../../application/use-cases/host-pool/place-workload-use-case";
import { ReleaseWorkloadUseCase } from "../../../../application/use-cases/host-pool/release-workload-use-case";
import { CloudAccount } from "../../../../domain/entities/cloud-account/cloud-account";
import { ComputeBinding } from "../../../../domain/entities/cloud-account/compute-binding";
import { Environment } from "../../../../domain/entities/environment/environment";
import { EnvironmentId } from "../../../../domain/entities/environment/environment-id";
import {
    EnvironmentQuota,
    EnvironmentQuotaPolicy,
} from "../../../../domain/entities/environment/environment-quota";
import { InternalError } from "../../../../domain/entities/error/internal-error";
import { HostPoolKey } from "../../../../domain/entities/host-pool/host-pool-key";
import { OwnershipMarker } from "../../../../domain/entities/verification/ownership-marker";

import { HostPoolEnvironmentConfig } from "./host-pool-environment-config";

// The bridge between the environment context and the host pool: to the routing gateway this is one
// more compute adapter (the `baremetal` kind); inside, it drives the pool's use cases the way a
// controller would — the pool is an embedded external system, not a sibling repository. Provisioning
// = seating the environment somewhere in the binding's pool; the machines' own lifecycle (ordering,
// idle return) belongs to the pool and never shows here.
export class HostPoolEnvironmentProviderGateway extends EnvironmentProviderGateway {
    constructor(
        private readonly placeWorkload: PlaceWorkloadUseCase,
        private readonly releaseWorkload: ReleaseWorkloadUseCase,
        private readonly hostProvider: HostProviderGateway,
        private readonly config: HostPoolEnvironmentConfig,
        private readonly quotaPolicy: EnvironmentQuotaPolicy,
    ) {
        super();
    }

    async provision(environment: Environment, cloudAccount: CloudAccount | null): Promise<void> {
        const { cloudAccount: account, binding } = this.boundBinding(environment, cloudAccount);

        // The machine budget derives from the binding's environment quota: enough machines to seat
        // every environment the quota admits, not one more — the quota is the single spend knob.
        const quota = EnvironmentQuota.fromBindingConfig(binding.config, this.quotaPolicy);

        await this.placeWorkload.execute({
            environmentId: EnvironmentId.fromString(environment.id),
            poolKey: new HostPoolKey(account.id, binding.id),
            capacitySlots: this.config.slotsPerHost,
            maxHosts: Math.ceil(quota.limit / this.config.slotsPerHost),
            providerContext: binding.config,
            launch: {
                avd: this.config.avdName(environment.platform.version),
                internalUrl: this.config.internalUrl,
            },
        });
    }

    async deprovision(environment: Environment): Promise<void> {
        await this.releaseWorkload.execute({ environmentId: EnvironmentId.fromString(environment.id) });
    }

    async checkAccess(_cloudAccount: CloudAccount, binding: ComputeBinding): Promise<CloudReachability> {
        return this.hostProvider.checkAccess(binding.config);
    }

    // Same ownership gate as every folder-scoped kind: the folder's owner authorises this project by
    // placing a per-project label we can read but never write.
    async verifyOwnership(cloudAccount: CloudAccount, binding: ComputeBinding): Promise<OwnershipVerification> {
        const markerKey = OwnershipMarker.forProject(cloudAccount.projectId.getValue()).value();

        try {
            const labels = await this.hostProvider.ownershipLabels(binding.config);

            return Object.prototype.hasOwnProperty.call(labels, markerKey)
                ? { verified: true }
                : { verified: false, detail: `the binding's folder is missing the ownership label ${markerKey}` };
        } catch (error) {
            return { verified: false, detail: error instanceof Error ? error.message : String(error) };
        }
    }

    // A pooled placement is keyed by the binding: without it there is no pool to seat the environment
    // in. The routing gateway only sends environments stamped with this kind here, so a missing
    // binding is a wiring defect, not a user error.
    private boundBinding(
        environment: Environment,
        cloudAccount: CloudAccount | null,
    ): { cloudAccount: CloudAccount; binding: ComputeBinding } {
        const binding = cloudAccount?.computeBindingFor(environment.platform.name, environment.execution);

        if (!cloudAccount || !binding) {
            throw new InternalError(`environment ${environment.id}: no compute binding for its host pool`);
        }

        return { cloudAccount, binding };
    }
}
