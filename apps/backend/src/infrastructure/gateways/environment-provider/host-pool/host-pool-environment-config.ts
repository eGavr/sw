// Install-level policy of a host-pool route: how a big machine is sliced, and what every slot's
// agent needs to call home. There is no machine cap here on purpose: the spend limit is the binding's
// ENVIRONMENT quota, and the machine budget derives from it (ceil(quota / slotsPerHost)).
export type HostPoolEnvironmentConfig = {
    // Seats per machine. Set from the leased configuration's size (e.g. 48 cores / 4 per emulator = 12);
    // the domain caps it at the adb-imposed 16 regardless.
    slotsPerHost: number;
    // Requested Android version -> the baked AVD name the slot boots (must exist in the golden image).
    avdName: (platformVersion: string) => string;
    // Base URL the in-slot agent calls back on (its per-env token arrives with the desired slot).
    internalUrl: string;
};

export type BuildHostPoolEnvironmentConfigOptions = {
    slotsPerHost: number;
    defaultAndroidVersion: string;
    internalUrl: string;
};

export const defaultSlotsPerHost = 12;
// AVDs are named by API level in the golden image (system images are published by API level).
export const defaultPoolAndroidVersion = "34";

// The AVD baked for a given Android version, by convention `sw-android-<version>` — the same contract
// the golden image bakes its AVDs under.
function toAvdName(version: string, fallback: string): string {
    return `sw-android-${version || fallback}`;
}

export function buildHostPoolEnvironmentConfig(
    options: BuildHostPoolEnvironmentConfigOptions,
): HostPoolEnvironmentConfig {
    return {
        slotsPerHost: options.slotsPerHost,
        avdName: (platformVersion: string): string => toAvdName(platformVersion, options.defaultAndroidVersion),
        internalUrl: options.internalUrl,
    };
}
