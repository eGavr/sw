import { NotFoundError } from "../../error/not-found/not-found-error";

export class PoolHostNotFoundError extends NotFoundError {
    constructor(hostId: string) {
        super(`pool host: ${hostId}: not found`);
    }
}
