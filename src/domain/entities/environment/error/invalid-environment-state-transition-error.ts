import { ConflictError } from "../../error/conflict-error";
import { EnvironmentState } from "../environment-state";

export class InvalidEnvironmentStateTransitionError extends ConflictError {
    constructor(from: EnvironmentState, to: EnvironmentState) {
        super(`environment: cannot transition from ${from} to ${to}`);
    }
}
