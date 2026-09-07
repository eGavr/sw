// What the agent detected about one installed application, keyed by the word (`nameAlias`) it was
// asked to install: for an APK, the package id (`name`) and versionName (`version`) from the manifest;
// a platform with nothing detectable reports what it can (a browser binary knows its version, not a
// package id).
export type ApplicationDetection = {
    readonly nameAlias: string;
    readonly name?: string | null;
    readonly version?: string | null;
};
