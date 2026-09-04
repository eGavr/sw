import { FailedPreconditionError } from "../../error/failed-precondition-error";

export class HostPoolExhaustedError extends FailedPreconditionError {
    constructor(maxHosts: number) {
        super(`host pool: every machine is full and the pool is at its cap of ${maxHosts} host(s)`);
    }
}
