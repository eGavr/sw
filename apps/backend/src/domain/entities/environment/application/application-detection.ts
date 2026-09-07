// What the agent detected about one installed application, keyed by the declared word it was asked
// to install: for an APK, the package id and versionName from the manifest; a platform with nothing
// detectable reports what it can (a browser binary knows its version, not a package id).
export type ApplicationDetection = {
    readonly name: string;
    readonly detectedName?: string | null;
    readonly detectedVersion?: string | null;
};
