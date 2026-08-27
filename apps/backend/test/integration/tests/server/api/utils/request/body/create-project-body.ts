import { defaultsDeep } from "lodash";
import { v4 as uuidv4 } from "uuid";

// Builds a valid POST /projects body (AIP: just displayName + optional projectId — clouds are connected
// separately via projects/{project}/cloudAccounts); overrides win over defaults.
export class CreateProjectBody {
    static create(overrides: object = {}): Record<string, unknown> {
        return defaultsDeep({}, overrides, {
            displayName: `team-${uuidv4().substring(0, 8)}`,
        });
    }
}
