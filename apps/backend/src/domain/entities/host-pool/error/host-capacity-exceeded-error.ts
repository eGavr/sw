import { ConflictError } from "../../error/conflict-error";

export class HostCapacityExceededError extends ConflictError {
    constructor(hostId: string, capacitySlots: number) {
        super(`host: ${hostId}: all ${capacitySlots} slots are taken`);
    }
}
