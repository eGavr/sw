// Liveness window: an environment (and its session) counts as fresh while its last heartbeat is within
// this window. Single source for deriving the effective status and for session allocation.
// FIXME: source from configuration.
export const defaultHeartbeatFreshnessMs = 6_000;
