import { ConflictError } from "../../error/conflict-error";

export class MachineNotClaimableError extends ConflictError {
    constructor(machineId: string, reason: string) {
        super(`machine: ${machineId}: cannot be leased: ${reason}`);
    }
}
