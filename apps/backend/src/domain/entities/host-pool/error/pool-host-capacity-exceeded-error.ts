import { ConflictError } from "../../error/conflict-error";

export class PoolHostCapacityExceededError extends ConflictError {
    constructor(hostId: string, capacitySlots: number) {
        super(`pool host: ${hostId}: all ${capacitySlots} slots are taken`);
    }
}
