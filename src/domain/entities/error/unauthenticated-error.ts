import { DomainError } from "./domain-error";

export class UnauthenticatedError extends DomainError {
    constructor(message = "authentication required") {
        super(message);
    }
}
