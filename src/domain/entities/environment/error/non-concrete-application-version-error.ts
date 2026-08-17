import { InvalidArgumentError } from "../../error/invalid-argument-error";

export class NonConcreteApplicationVersionError extends InvalidArgumentError {
    constructor(version: string) {
        super(`application version must be concrete, got "${version}"`);
    }
}
