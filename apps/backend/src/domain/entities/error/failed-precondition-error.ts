import { DomainError } from "./domain-error";

// The request is valid but the system is not in a state where it can ever succeed as-is — the caller
// must change the state first (google.rpc FAILED_PRECONDITION), so retrying is pointless. Contrast with
// ConflictError, where the state is transient and a retry may help.
export class FailedPreconditionError extends DomainError {}
