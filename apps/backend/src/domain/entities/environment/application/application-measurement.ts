// What the agent measured about one installed application, keyed by the declared word it was asked
// to install: for an APK, the package id and versionName from the manifest; a platform with nothing
// measurable reports what it can (a browser binary knows its version, not a package id).
export type ApplicationMeasurement = {
    readonly name: string;
    readonly measuredName?: string | null;
    readonly measuredVersion?: string | null;
};
