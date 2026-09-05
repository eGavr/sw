import { InvalidArgumentError } from "../../error/invalid-argument-error";

export class UnsupportedPlatformError extends InvalidArgumentError {
    constructor(platformName: string, version: string, supportedVersions: ReadonlyArray<string>) {
        super(
            supportedVersions.length > 0
                ? `platform ${platformName} ${version}: unsupported (supported: ${supportedVersions.join(", ")})`
                : `platform ${platformName}: no base images in this install's catalog`,
        );
    }
}
