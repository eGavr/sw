import { ConflictError } from "../../error/conflict-error";
import { HostState } from "../host-state";

export class InvalidHostStateTransitionError extends ConflictError {
    constructor(from: HostState, to: HostState) {
        super(`host: cannot transition from ${from} to ${to}`);
    }
}
