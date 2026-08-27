import { NotFoundError } from "./not-found-error";

export class NotFoundResourceError extends NotFoundError {
    constructor(resourceId: string) {
        super(`resource: ${resourceId}: not found`);
    }
}
