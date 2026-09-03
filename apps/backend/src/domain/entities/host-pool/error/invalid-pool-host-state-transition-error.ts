import { ConflictError } from "../../error/conflict-error";
import { PoolHostState } from "../pool-host-state";

export class InvalidPoolHostStateTransitionError extends ConflictError {
    constructor(from: PoolHostState, to: PoolHostState) {
        super(`pool host: cannot transition from ${from} to ${to}`);
    }
}
