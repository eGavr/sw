export type AndroidRedroidEnvironmentConfig = {
    // The prebaked golden image every Android VM is created from (docker + redroid tags + companion +
    // binder + the boot unit). See packages/android-node.
    imageId: string;
    zone: string;
    subnetId: string;
    securityGroupId?: string;
    cores: number;
    memoryGb: number;
    diskSizeGb: number;
    // Requested Android version -> the redroid image tag the VM boots (must be one baked into the image).
    redroidTag: (platformVersion: string) => string;
    // Base URL the in-VM agent calls back on (its per-env token is minted separately).
    internalUrl: string;
};

export type BuildAndroidRedroidEnvironmentConfigOptions = {
    imageId: string;
    zone: string;
    subnetId: string;
    securityGroupId?: string;
    cores: number;
    memoryGb: number;
    diskSizeGb: number;
    defaultAndroidVersion: string;
    internalUrl: string;
};

export const defaultAndroidCores = 4;
export const defaultAndroidMemoryGb = 8;
export const defaultAndroidDiskGb = 40;
export const defaultAndroidVersion = "13";

// A bare major version ("13") maps to the redroid tag convention "13.0.0-latest"; an already-qualified tag
// (contains a "." or "-latest") is used as-is, so callers can pin an exact redroid tag when needed.
function toRedroidTag(version: string): string {
    const requested = version || defaultAndroidVersion;

    return requested.includes(".") || requested.includes("-") ? requested : `${requested}.0.0-latest`;
}

export function buildAndroidRedroidEnvironmentConfig(
    options: BuildAndroidRedroidEnvironmentConfigOptions,
): AndroidRedroidEnvironmentConfig {
    return {
        imageId: options.imageId,
        zone: options.zone,
        subnetId: options.subnetId,
        securityGroupId: options.securityGroupId,
        cores: options.cores,
        memoryGb: options.memoryGb,
        diskSizeGb: options.diskSizeGb,
        redroidTag: (version) => toRedroidTag(version || options.defaultAndroidVersion),
        internalUrl: options.internalUrl,
    };
}
