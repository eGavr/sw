import { ConflictError } from "../../error/conflict-error";
import { MachineLeaseState } from "../machine-lease-state";

export class InvalidMachineLeaseStateTransitionError extends ConflictError {
    constructor(from: MachineLeaseState, to: MachineLeaseState) {
        super(`pool lease: cannot transition from ${from} to ${to}`);
    }
}
