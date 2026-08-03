import { NotFoundError } from "../../error/not-found/not-found-error";

export class SessionNotFoundError extends NotFoundError {
    constructor(sessionId: string) {
        super(`session: ${sessionId}: not found`);
    }
}
