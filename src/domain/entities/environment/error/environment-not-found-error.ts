import { NotFoundError } from "../../error/not-found/not-found-error";

export class EnvironmentNotFoundError extends NotFoundError {
    constructor(environmentId: string) {
        super(`environment: ${environmentId}: not found`);
    }
}
