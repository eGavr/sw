import { ConflictError } from "../../error/conflict-error";

export class EnvironmentBusyError extends ConflictError {
    constructor(environmentId: string) {
        super(`environment: ${environmentId}: already has an active session`);
    }
}
