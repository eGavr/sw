import { ResourceExhaustedError } from "../../error/resource-exhausted-error";

export class EnvironmentQuotaExceededError extends ResourceExhaustedError {
    constructor(current: number, limit: number) {
        super(`environment quota: the binding already holds ${current} of ${limit} environments`);
    }
}
