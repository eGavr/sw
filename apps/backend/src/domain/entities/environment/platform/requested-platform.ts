import { InvalidArgumentError } from "../../error/invalid-argument-error";

import { Platform } from "./platform";
import { PlatformName } from "./platform-name";

// The W3C `platformName` family words a session may send: a family is not a platform (it has no version
// of its own), it opens onto the concrete platforms of that family — every linux this install runs.
const platformFamilies: ReadonlyMap<string, ReadonlyArray<PlatformName>> = new Map([
    ["linux", [PlatformName.Ubuntu]],
]);

// What a session asks for as its platform: a concrete platform (`android`, `ubuntu`) or a family word
// (`linux`), expanded once into the concrete platforms it admits so that allocation only ever compares
// platform names. The word itself is kept for the refusal messages the caller reads back.
export class RequestedPlatform {
    static create(word: string): RequestedPlatform {
        const concrete = Object.values(PlatformName).find((candidate) => candidate === word);

        if (concrete) {
            return new RequestedPlatform(word, [concrete]);
        }

        const family = platformFamilies.get(word);

        if (family) {
            return new RequestedPlatform(word, family);
        }

        throw new InvalidArgumentError(
            `platform: ${word}: unknown (one of ${[...Object.values(PlatformName), ...platformFamilies.keys()].join(", ")})`,
        );
    }

    private constructor(
        readonly word: string,
        private readonly _names: ReadonlyArray<PlatformName>,
    ) {}

    get names(): ReadonlyArray<PlatformName> {
        return this._names;
    }

    matches(platform: Platform): boolean {
        return this._names.includes(platform.name);
    }
}
