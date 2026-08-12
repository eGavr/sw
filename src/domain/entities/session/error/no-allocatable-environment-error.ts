import { ConflictError } from "../../error/conflict-error";

export class NoAllocatableEnvironmentError extends ConflictError {
    constructor(applicationName: string, applicationVersion: string) {
        super(`session: no free environment for ${applicationName} ${applicationVersion}`);
    }
}
