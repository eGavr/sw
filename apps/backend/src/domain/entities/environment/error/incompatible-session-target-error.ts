import { InvalidArgumentError } from "../../error/invalid-argument-error";

// The session was targeted at an environment that can never serve it (wrong application, version or
// execution substrate) — an invalid request, not a transient conflict.
export class IncompatibleSessionTargetError extends InvalidArgumentError {
    constructor(environmentId: string, applicationName: string, applicationVersion: string) {
        super(
            `environment ${environmentId}: does not offer ${applicationName} ${applicationVersion} on the requested substrate`,
        );
    }
}
