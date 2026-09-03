import {
    CloudReachability,
    EnvironmentProviderGateway,
    OwnershipVerification,
} from "../../../../application/interfaces/gateways/environment-provider-gateway";
import { CloudAccount } from "../../../../domain/entities/cloud-account/cloud-account";
import { ComputeBinding, ComputeBindingConfig } from "../../../../domain/entities/cloud-account/compute-binding";
import { Environment } from "../../../../domain/entities/environment/environment";
import { OwnershipMarker } from "../../../../domain/entities/verification/ownership-marker";

import { vmProvisioningOverrides } from "./vm-provider-config";
import { VmProvisioner } from "./vm-provisioner";

// The install-default shape of the VM an adapter provisions per environment; the substrate binding's
// config overrides folder/network/image per project (delegated BYOC).
export type VmInstanceShape = {
    imageId: string;
    platformId?: string;
    zone: string;
    subnetId: string;
    securityGroupId?: string;
    cores: number;
    memoryGb: number;
    diskSizeGb: number;
};

// Common half of every VM-per-environment adapter (redroid, emulator, browser): merge the binding's
// overrides into the install shape, create/delete the instance in the binding's folder, probe that folder
// for the availability badge. What varies per adapter is only the metadata the VM self-configures from —
// the boot unit inside the golden image reads it and brings the node up; the adapter never SSHes in.
export abstract class VmEnvironmentProviderGateway extends EnvironmentProviderGateway {
    protected constructor(
        private readonly compute: VmProvisioner,
        private readonly shape: VmInstanceShape,
    ) {
        super();
    }

    async provision(environment: Environment, cloudAccount: CloudAccount | null): Promise<void> {
        const overrides = vmProvisioningOverrides(this.boundConfigFor(environment, cloudAccount));

        await this.compute.createInstance({
            name: this.instanceName(environment),
            folderId: overrides.folderId,
            imageId: overrides.imageId ?? this.shape.imageId,
            platformId: this.shape.platformId,
            zone: overrides.zone ?? this.shape.zone,
            subnetId: overrides.subnetId ?? this.shape.subnetId,
            securityGroupId: overrides.securityGroupId ?? this.shape.securityGroupId,
            cores: this.shape.cores,
            memoryGb: this.shape.memoryGb,
            diskSizeGb: this.shape.diskSizeGb,
            metadata: await this.metadataFor(environment),
        });
    }

    async deprovision(environment: Environment, cloudAccount: CloudAccount | null): Promise<void> {
        // Delete in the same folder we created it in, or the user's VM leaks (and keeps costing them).
        await this.compute.deleteInstance(
            this.instanceName(environment),
            vmProvisioningOverrides(this.boundConfigFor(environment, cloudAccount)).folderId,
        );
    }

    async checkAccess(_cloudAccount: CloudAccount, binding: ComputeBinding): Promise<CloudReachability> {
        return this.compute.checkAccess(vmProvisioningOverrides(binding.config).folderId);
    }

    // The folder's owner authorises this project by placing a per-project label on the folder; we read it
    // (resource-manager.viewer, which cannot write it). Naming someone else's folder fails: it carries no
    // marker for this project and only its owner could add one.
    async verifyOwnership(cloudAccount: CloudAccount, binding: ComputeBinding): Promise<OwnershipVerification> {
        const folderId = vmProvisioningOverrides(binding.config).folderId;

        if (!folderId) {
            return { verified: false, detail: "no folder configured on the binding" };
        }

        const markerKey = OwnershipMarker.forProject(cloudAccount.projectId.getValue()).value();

        try {
            const labels = await this.compute.folderLabels(folderId);

            return Object.prototype.hasOwnProperty.call(labels, markerKey)
                ? { verified: true }
                : { verified: false, detail: `folder ${folderId} is missing the ownership label ${markerKey}` };
        } catch (error) {
            return { verified: false, detail: error instanceof Error ? error.message : String(error) };
        }
    }

    // The per-environment attributes the golden image's boot unit reads to bring the node up.
    protected abstract metadataFor(environment: Environment): Promise<Record<string, string>>;

    // The provisioning config lives on the environment's substrate binding (folderId is the delegation
    // target). Absent binding/keys leave the install default in place (the operator's own folder).
    private boundConfigFor(
        environment: Environment,
        cloudAccount: CloudAccount | null,
    ): ComputeBindingConfig | undefined {
        return cloudAccount?.computeBindingFor(environment.platform.name, environment.execution)?.config;
    }

    // A YC instance name is a DNS label; the environment id is a lowercase uuid, so `sw-env-<uuid>` is a
    // valid, per-environment-unique name — provision and deprovision address the same VM by it.
    private instanceName(environment: Environment): string {
        return `sw-env-${environment.id}`;
    }
}
