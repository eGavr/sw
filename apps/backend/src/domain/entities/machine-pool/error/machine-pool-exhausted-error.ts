import { FailedPreconditionError } from "../../error/failed-precondition-error";

export class MachinePoolExhaustedError extends FailedPreconditionError {
    constructor(maxHosts: number) {
        super(`machine pool: every machine is full and the pool is at its cap of ${maxHosts} lease(s)`);
    }
}
