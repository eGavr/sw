import { NotFoundError } from "../../error/not-found/not-found-error";

export class HostNotFoundError extends NotFoundError {
    constructor(hostId: string) {
        super(`host: ${hostId}: not found`);
    }
}
