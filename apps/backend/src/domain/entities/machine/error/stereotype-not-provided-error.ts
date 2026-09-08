import { InvalidArgumentError } from "../../error/invalid-argument-error";

export class StereotypeNotProvidedError extends InvalidArgumentError {
    constructor(platformName: string, execution: string) {
        super(`machine: ${platformName}/${execution}: the cloud has no compute binding for it; bind the platform first`);
    }
}
