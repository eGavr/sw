import { InvalidArgumentError } from "../../error/invalid-argument-error";

// The caller named a cloud that is not this project's, or one that does not run the asked substrate —
// a wrong address, not a full cloud.
export class CloudDoesNotServeError extends InvalidArgumentError {
    constructor(cloudAccountId: string, platformName: string, execution: string) {
        super(`cloud account ${cloudAccountId}: this project has no such cloud serving ${platformName}/${execution}`);
    }
}
