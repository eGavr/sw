import { InvalidArgumentError } from "../../../../domain/entities/error/invalid-argument-error";
import { ProviderConfig } from "../../../../domain/entities/provider-account/provider-account";

export type DockerProvisioningOverrides = {
    image?: string;
    baseImage?: string;
    platform?: string;
    internalPort?: number;
};

// Reads the docker adapter's provisioning shape out of a provider account's opaque config blob, validating
// the few keys it understands (a wrong type fails fast). Absent keys leave the install default in place, so
// a project with no config provisions exactly as before.
export function dockerProvisioningOverrides(config: ProviderConfig | undefined): DockerProvisioningOverrides {
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

function optionalString(config: ProviderConfig, key: string): string | undefined {
    const value = config[key];

    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== "string" || value.length === 0) {
        throw new InvalidArgumentError(`provider config: "${key}" must be a non-empty string`);
    }

    return value;
}

function optionalPort(config: ProviderConfig, key: string): number | undefined {
    const value = config[key];

    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
        throw new InvalidArgumentError(`provider config: "${key}" must be a positive integer`);
    }

    return value;
}
