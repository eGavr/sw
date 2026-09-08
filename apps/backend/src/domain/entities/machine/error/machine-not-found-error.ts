import { NotFoundError } from "../../error/not-found/not-found-error";

export class MachineNotFoundError extends NotFoundError {
    constructor(machineId: string) {
        super(`machine: ${machineId}: not found`);
    }
}
