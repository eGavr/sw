import { NotFoundError } from "../../error/not-found/not-found-error";

// No log is stored for the requested session (the project has no storage destination, or nothing was
// ever uploaded for it). The message carries no session id — that is a capability secret.
export class SessionLogNotFoundError extends NotFoundError {
    constructor() {
        super("session log: not found");
    }
}
