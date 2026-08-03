import { DomainError } from "../../error/domain-error";

export class EnvironmentBusyError extends DomainError {
    constructor(environmentId: string) {
        super(`environment: ${environmentId}: already has an active session`);
    }
}
