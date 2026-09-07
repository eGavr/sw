import { InvalidArgumentError } from "../../error/invalid-argument-error";

// The platform line offers several device kinds, so the environment must name the one it is.
export class DeviceModelRequiredError extends InvalidArgumentError {
    constructor(platformName: string, supported: ReadonlyArray<string>) {
        super(`platform ${platformName}: deviceModel is required (one of: ${supported.join(", ")})`);
    }
}
