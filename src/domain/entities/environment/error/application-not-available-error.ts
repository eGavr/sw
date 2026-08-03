import { InvalidArgumentError } from "../../error/invalid-argument-error";

export class ApplicationNotAvailableError extends InvalidArgumentError {
    constructor(name: string, version: string) {
        super(`application: ${name}@${version}: not available in the environment`);
    }
}
