import { ConflictError } from "../../error/conflict-error";

export class MachineLeaseCapacityExceededError extends ConflictError {
    constructor(leaseId: string, slotCapacity: number) {
        super(`pool lease: ${leaseId}: all ${slotCapacity} slots are taken`);
    }
}
