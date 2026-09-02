import { ConflictError } from "../../error/conflict-error";

// A substrate is served by exactly one binding — a second one would make provisioning ambiguous.
export class ComputeBindingConflictError extends ConflictError {
    constructor(platformName: string, execution: string) {
        super(`compute binding: ${platformName}/${execution}: already bound`);
    }
}
