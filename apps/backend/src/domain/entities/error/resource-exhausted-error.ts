import { DomainError } from "./domain-error";

// A quota or capacity limit is spent: the request was fine, the state allows it, but the caller has
// used up what they are allowed to hold (google.rpc RESOURCE_EXHAUSTED, HTTP 429).
export class ResourceExhaustedError extends DomainError {}
