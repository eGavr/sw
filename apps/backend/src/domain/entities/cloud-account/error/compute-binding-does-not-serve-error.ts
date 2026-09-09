import { InvalidArgumentError } from "../../error/invalid-argument-error";

// The caller pinned the placement to a binding that is not this project's, or does not run the asked
// substrate — a wrong address, not a full cloud.
export class ComputeBindingDoesNotServeError extends InvalidArgumentError {
    constructor(bindingId: string, platformName: string, execution: string) {
        super(`compute binding ${bindingId}: this project has no such binding serving ${platformName}/${execution}`);
    }
}
