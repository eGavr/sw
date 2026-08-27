import { ConflictError } from "../../../error/conflict-error";

// The etag sent with setIamPolicy does not match the policy's current version: it was modified since it
// was read (google.iam.v1 optimistic concurrency). Maps to 409 ABORTED — re-read the policy and retry.
export class IamPolicyEtagMismatchError extends ConflictError {
    constructor() {
        super("iam policy: etag mismatch: the policy was modified since it was read; re-read and retry");
    }
}
