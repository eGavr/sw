import { InternalError } from "../../error/internal-error";

// The reserved environment's node did not deliver the session (rejected, timed out, unreachable).
// Named after the W3C WebDriver "session not created" error; carries the real cause instead of
// reading as "no environments available" — the pool was fine, this one create failed.
export class SessionNotCreatedError extends InternalError {
    constructor(cause: string) {
        super(`session not created: ${cause}`);
    }
}
