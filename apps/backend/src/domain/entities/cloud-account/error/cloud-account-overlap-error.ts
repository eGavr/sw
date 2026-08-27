import { ConflictError } from "../../error/conflict-error";

// A project keeps its clouds non-overlapping so each (platform, execution) resolves to exactly one cloud
// account. Connecting a cloud whose substrates overlap an already-active one is rejected.
export class CloudAccountOverlapError extends ConflictError {
    constructor(type: string, conflictingType: string) {
        super(
            `cloud account: ${type}: overlaps a substrate already provided by ${conflictingType} in this project`,
        );
    }
}
