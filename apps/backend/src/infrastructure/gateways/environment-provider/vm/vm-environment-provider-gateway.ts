import {
    CloudReachability,
    EnvironmentProviderGateway,
} from "../../../../application/interfaces/gateways/environment-provider-gateway";
import { CloudAccount } from "../../../../domain/entities/cloud-account/cloud-account";
import { Environment } from "../../../../domain/entities/environment/environment";

import { vmProvisioningOverrides } from "./vm-provider-config";
import { VmProvisioner } from "./vm-provisioner";

// The install-default shape of the VM an adapter provisions per environment; a cloud account's config
// overrides folder/network/image per project (delegated BYOC).
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

// Common half of every VM-per-environment adapter (redroid, emulator, browser): merge the account's
// overrides into the install shape, create/delete the instance in the account's folder, probe that folder
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
        const overrides = vmProvisioningOverrides(cloudAccount?.config);

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
            vmProvisioningOverrides(cloudAccount?.config).folderId,
        );
    }

    async checkAccess(cloudAccount: CloudAccount): Promise<CloudReachability> {
        return this.compute.checkAccess(vmProvisioningOverrides(cloudAccount.config).folderId);
    }

    // The per-environment attributes the golden image's boot unit reads to bring the node up.
    protected abstract metadataFor(environment: Environment): Promise<Record<string, string>>;

    // A YC instance name is a DNS label; the environment id is a lowercase uuid, so `sw-env-<uuid>` is a
    // valid, per-environment-unique name — provision and deprovision address the same VM by it.
    private instanceName(environment: Environment): string {
        return `sw-env-${environment.id}`;
    }
}
