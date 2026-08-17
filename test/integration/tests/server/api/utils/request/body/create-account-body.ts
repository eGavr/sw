import { defaultsDeep } from "lodash";
import { v4 as uuidv4 } from "uuid";

// Builds a valid POST /accounts body (AIP: displayName + compute binding); overrides win over defaults.
export class CreateAccountBody {
    static create(overrides: object = {}): Record<string, unknown> {
        return defaultsDeep({}, overrides, {
            displayName: `team-${uuidv4().substring(0, 8)}`,
            compute: [{ provider: "noop", externalRef: "provider-id", platform: "linux", execution: "container" }],
        });
    }
}
