import { CloudConfig } from "../../../../domain/entities/cloud-account/cloud-account";
import { InvalidArgumentError } from "../../../../domain/entities/error/invalid-argument-error";

import { ResourceQuantities } from "./kubernetes-environment-config";

export type KubernetesResources = {
    requests: ResourceQuantities;
    limits: ResourceQuantities;
};

export type KubernetesProvisioningOverrides = {
    image?: string;
    containerPort?: number;
    resources?: KubernetesResources;
};

// Reads the kubernetes adapter's provisioning shape out of a cloud account's opaque config blob,
// validating the few keys it understands (a wrong type fails fast). Absent keys leave the install default
// in place, so a project with no config provisions exactly as before. Install-level fields (namespace,
// networking, node-port range, callback URL/secret) are cluster topology and isolation, not per-project,
// so they are not overridable here.
export function kubernetesProvisioningOverrides(config: CloudConfig | undefined): KubernetesProvisioningOverrides {
    if (!config) {
        return {};
    }

    return {
        image: optionalString(config, "image"),
        containerPort: optionalPort(config, "port"),
        resources: optionalResources(config, "resources"),
    };
}

function optionalString(config: CloudConfig, key: string): string | undefined {
    const value = config[key];

    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== "string" || value.length === 0) {
        throw new InvalidArgumentError(`provider config: "${key}" must be a non-empty string`);
    }

    return value;
}

function optionalPort(config: CloudConfig, key: string): number | undefined {
    const value = config[key];

    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
        throw new InvalidArgumentError(`provider config: "${key}" must be a positive integer`);
    }

    return value;
}

// A resources override sets the whole scheduler shape at once (both requests and limits, cpu and memory),
// mirroring the install default — a partial override would need merge semantics the config blob can't express.
function optionalResources(config: CloudConfig, key: string): KubernetesResources | undefined {
    const value = config[key];

    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== "object" || value === null) {
        throw new InvalidArgumentError(`provider config: "${key}" must be an object`);
    }

    const resources = value as Record<string, unknown>;

    return {
        requests: quantities(resources, "requests"),
        limits: quantities(resources, "limits"),
    };
}

function quantities(resources: Record<string, unknown>, group: string): ResourceQuantities {
    const value = resources[group];

    if (typeof value !== "object" || value === null) {
        throw new InvalidArgumentError(`provider config: "resources.${group}" must be an object`);
    }

    const record = value as Record<string, unknown>;

    return { cpu: quantity(record, group, "cpu"), memory: quantity(record, group, "memory") };
}

function quantity(record: Record<string, unknown>, group: string, key: string): string {
    const value = record[key];

    if (typeof value !== "string" || value.length === 0) {
        throw new InvalidArgumentError(`provider config: "resources.${group}.${key}" must be a non-empty string`);
    }

    return value;
}
