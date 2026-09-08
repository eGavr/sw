// Install-level policy of a machine-pool route: how a big machine is sliced, and what every slot's
// agent needs to call home. There is no machine cap here on purpose: the spend limit is the binding's
// ENVIRONMENT quota, and the machine budget derives from it (ceil(quota / slotsPerMachine)).
export type MachinePoolEnvironmentConfig = {
    // Seats per machine. Set from the leased configuration's size (e.g. 48 cores / 4 per emulator = 12);
    // the domain caps it at the adb-imposed 16 regardless.
    slotsPerMachine: number;
    // Requested Android version -> the baked BASE AVD name for that version (must exist in the golden
    // image); the slot derives the per-device-kind AVD from it (`<base>-<device>`) on first use.
    avdName: (platformVersion: string) => string;
    // Base URL the in-slot agent calls back on (its per-env token arrives with the desired slot).
    internalUrl: string;
    // The smart idle timeout the slot's wd door applies to a session with no commands — the install's
    // one session idle timeout, the same every node kind enforces.
    sessionTimeoutSeconds: number;
};

export type BuildMachinePoolEnvironmentConfigOptions = {
    slotsPerMachine: number;
    defaultAndroidVersion: string;
    internalUrl: string;
    sessionTimeoutSeconds: number;
};

export const defaultSlotsPerMachine = 12;
// AVDs are named by API level in the golden image (system images are published by API level).
export const defaultPoolAndroidVersion = "34";

// The AVD baked for a given Android version, by convention `sw-android-<version>` — the same contract
// the golden image bakes its AVDs under.
function toAvdName(version: string, fallback: string): string {
    return `sw-android-${version || fallback}`;
}

export function buildMachinePoolEnvironmentConfig(
    options: BuildMachinePoolEnvironmentConfigOptions,
): MachinePoolEnvironmentConfig {
    return {
        slotsPerMachine: options.slotsPerMachine,
        avdName: (platformVersion: string): string => toAvdName(platformVersion, options.defaultAndroidVersion),
        internalUrl: options.internalUrl,
        sessionTimeoutSeconds: options.sessionTimeoutSeconds,
    };
}
