import { ComputeBindingConfig } from "../../../../domain/entities/cloud-account/compute-binding";
import { InvalidArgumentError } from "../../../../domain/entities/error/invalid-argument-error";

// The provisioning shape for the YC VM adapters, read from a substrate binding's opaque config blob.
// `folderId` is the delegation target — the user's folder we provision into and were granted access to;
// the rest place the VM in their network/image. Absent keys leave the install default in place, so a
// binding with only the folder provisions the standard shape there.
export type VmProvisioningOverrides = {
    folderId?: string;
    imageId?: string;
    zone?: string;
    subnetId?: string;
    securityGroupId?: string;
};

export function vmProvisioningOverrides(config: ComputeBindingConfig | undefined): VmProvisioningOverrides {
    if (!config) {
        return {};
    }

    return {
        folderId: optionalString(config, "folderId"),
        imageId: optionalString(config, "imageId"),
        zone: optionalString(config, "zone"),
        subnetId: optionalString(config, "subnetId"),
        securityGroupId: optionalString(config, "securityGroupId"),
    };
}

function optionalString(config: ComputeBindingConfig, key: string): string | undefined {
    const value = config[key];

    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== "string" || value.length === 0) {
        throw new InvalidArgumentError(`provider config: "${key}" must be a non-empty string`);
    }

    return value;
}
