import { FailedPreconditionError } from "../../error/failed-precondition-error";

export class MachineLeasedError extends FailedPreconditionError {
    constructor(machineId: string) {
        super(`machine: ${machineId}: is leased by the pool; drain it first, or detach with force`);
    }
}
