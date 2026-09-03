import { ConflictError } from "../../error/conflict-error";

export class HostNotPlaceableError extends ConflictError {
    constructor(hostId: string, state: string) {
        super(`host: ${hostId}: cannot place a workload while ${state}`);
    }
}
