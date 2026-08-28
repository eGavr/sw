import { ConflictError } from "../../error/conflict-error";

// The targeted environment matches the request but cannot take a session right now (not executing,
// busy, or its heartbeat went stale) — a transient state worth retrying.
export class TargetEnvironmentNotReadyError extends ConflictError {
    constructor(environmentId: string) {
        super(`environment ${environmentId}: not ready for a session`);
    }
}
