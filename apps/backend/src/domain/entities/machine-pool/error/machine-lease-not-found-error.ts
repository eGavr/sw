import { NotFoundError } from "../../error/not-found/not-found-error";

export class MachineLeaseNotFoundError extends NotFoundError {
    constructor(leaseId: string) {
        super(`pool lease: ${leaseId}: not found`);
    }
}
