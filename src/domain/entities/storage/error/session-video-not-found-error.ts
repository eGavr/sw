import { NotFoundError } from "../../error/not-found/not-found-error";

// No video is stored for the requested session (the project has no storage destination, or nothing was
// ever recorded/uploaded for it). The message carries no session id — that is a capability secret.
export class SessionVideoNotFoundError extends NotFoundError {
    constructor() {
        super("session video: not found");
    }
}
