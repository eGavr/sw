import { Matches } from "class-validator";

import { Value } from "../../../types/value/value";

// The reserved version a session may request to mean "the newest running environment"; an environment's
// installed application must always name an exact version, never this.
export const latestApplicationVersion = "latest";

export class ApplicationVersion extends Value<string> {
    @Matches(/^[a-zA-Z0-9.\-_]+$/)
    declare protected value: string;

    // Orders two versions by dotted segments, newest greater: numeric segments compare as numbers
    // ("9" < "10", "141" > "139"), a missing segment counts as "0" ("1.2" == "1.2.0" < "1.2.1"), and a
    // non-numeric segment falls back to a string comparison. Returns <0, 0 or >0 like a comparator.
    compareTo(other: ApplicationVersion): number {
        const mine = this.getValue().split(".");
        const theirs = other.getValue().split(".");
        const length = Math.max(mine.length, theirs.length);

        for (let index = 0; index < length; index++) {
            const difference = compareSegment(mine[index] ?? "0", theirs[index] ?? "0");

            if (difference !== 0) {
                return difference;
            }
        }

        return 0;
    }
}

function compareSegment(left: string, right: string): number {
    if (left === right) {
        return 0;
    }

    if (isNumeric(left) && isNumeric(right)) {
        return Number(left) - Number(right);
    }

    return left < right ? -1 : 1;
}

function isNumeric(segment: string): boolean {
    return segment !== "" && !Number.isNaN(Number(segment));
}
