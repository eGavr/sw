import { ConflictError } from "../../error/conflict-error";

export class ApplicationConflictError extends ConflictError {
    constructor(platformName: string, name: string) {
        super(`application ${name} on ${platformName} is already registered in the project`);
    }
}
