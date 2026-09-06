import { ConflictError } from "../../error/conflict-error";

export class ApplicationVersionConflictError extends ConflictError {
    constructor(applicationName: string, version: string) {
        super(`application ${applicationName}: version ${version} is already registered`);
    }
}
