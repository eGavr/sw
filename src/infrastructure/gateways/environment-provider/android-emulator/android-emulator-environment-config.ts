export type AndroidEmulatorEnvironmentConfig = {
    // The prebaked golden image every emulator VM is created from (Android SDK + emulator + a fixed set of
    // AVDs/system images + Appium + companion + the boot unit). See packages/android-emulator-node.
    imageId: string;
    // A KVM-capable YC hardware platform (the emulator needs /dev/kvm). The operator supplies one; today
    // that is bare metal, a minimal per-emulator VM once nested virtualization is available.
    platformId?: string;
    zone: string;
    subnetId: string;
    securityGroupId?: string;
    cores: number;
    memoryGb: number;
    diskSizeGb: number;
    // Requested Android version -> the baked AVD name the VM boots (must be one baked into the image).
    avdName: (platformVersion: string) => string;
    // Base URL the in-VM agent calls back on (its per-env token is minted separately).
    internalUrl: string;
};

export type BuildAndroidEmulatorEnvironmentConfigOptions = {
    imageId: string;
    platformId?: string;
    zone: string;
    subnetId: string;
    securityGroupId?: string;
    cores: number;
    memoryGb: number;
    diskSizeGb: number;
    defaultAndroidVersion: string;
    internalUrl: string;
};

// One emulator wants a couple of vCPUs, several GB of RAM and enough disk for the system image + userdata.
export const defaultEmulatorCores = 4;
export const defaultEmulatorMemoryGb = 8;
export const defaultEmulatorDiskGb = 30;
// AVDs are named by API level in the golden image (system images are published by API level).
export const defaultEmulatorAndroidVersion = "34";

// The AVD baked for a given Android version, by convention `sw-android-<version>` (e.g. `sw-android-34`).
// The boot script picks this AVD, so the golden image must bake an AVD of that name for every supported
// version.
function toAvdName(version: string, fallback: string): string {
    return `sw-android-${version || fallback}`;
}

export function buildAndroidEmulatorEnvironmentConfig(
    options: BuildAndroidEmulatorEnvironmentConfigOptions,
): AndroidEmulatorEnvironmentConfig {
    return {
        imageId: options.imageId,
        platformId: options.platformId,
        zone: options.zone,
        subnetId: options.subnetId,
        securityGroupId: options.securityGroupId,
        cores: options.cores,
        memoryGb: options.memoryGb,
        diskSizeGb: options.diskSizeGb,
        avdName: (version) => toAvdName(version, options.defaultAndroidVersion),
        internalUrl: options.internalUrl,
    };
}
