import { ConflictError } from "../../error/conflict-error";

export class MachineLeaseNotPlaceableError extends ConflictError {
    constructor(leaseId: string, state: string) {
        super(`pool lease: ${leaseId}: cannot place a workload while ${state}`);
    }
}
