import { ComputeBindingConfig } from "../../../../domain/entities/cloud-account/compute-binding";
import { InvalidArgumentError } from "../../../../domain/entities/error/invalid-argument-error";

export type DockerProvisioningOverrides = {
    image?: string;
    baseImage?: string;
    platform?: string;
    internalPort?: number;
};

// Reads the docker adapter's provisioning shape out of a substrate binding's opaque config blob, validating
// the few keys it understands (a wrong type fails fast). Absent keys leave the install default in place, so
// a binding with no config provisions exactly as before.
export function dockerProvisioningOverrides(config: ComputeBindingConfig | undefined): DockerProvisioningOverrides {
    if (!config) {
        return {};
    }

    return {
        image: optionalString(config, "image"),
        baseImage: optionalString(config, "baseImage"),
        platform: optionalString(config, "platform"),
        internalPort: optionalPort(config, "port"),
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

function optionalPort(config: ComputeBindingConfig, key: string): number | undefined {
    const value = config[key];

    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
        throw new InvalidArgumentError(`provider config: "${key}" must be a positive integer`);
    }

    return value;
}
