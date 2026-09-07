import { Matches } from "class-validator";

import { Value } from "../../../types/value/value";
import { matchesSegmentPrefix } from "../version-segment-prefix";

export class PlatformVersion extends Value<string> {
    @Matches(/^[a-zA-Z0-9.\-_]+$/)
    declare protected value: string;

    // A session asks loosely ("14" opens "14.0.1"), the environment's version is exact.
    matchesPrefix(prefix: string): boolean {
        return matchesSegmentPrefix(this.value, prefix);
    }
}
