import { ConflictError } from "../../error/conflict-error";

export class PoolHostNotPlaceableError extends ConflictError {
    constructor(hostId: string, state: string) {
        super(`pool host: ${hostId}: cannot place a workload while ${state}`);
    }
}
