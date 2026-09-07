import { InvalidArgumentError } from "../../error/invalid-argument-error";

export class UnsupportedDeviceModelError extends InvalidArgumentError {
    constructor(platformName: string, deviceModel: string, supported: ReadonlyArray<string>) {
        super(`platform ${platformName}: device model ${deviceModel}: unsupported (supported: ${supported.join(", ")})`);
    }
}
