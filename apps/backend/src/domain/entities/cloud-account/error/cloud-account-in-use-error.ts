import { ConflictError } from "../../error/conflict-error";

// Disconnecting a cloud is a real delete, so it is refused while environments still reference the
// account — delete those environments first.
export class CloudAccountInUseError extends ConflictError {
    constructor(cloudAccountId: string) {
        super(`cloud account: ${cloudAccountId}: still referenced by environments`);
    }
}
