import { InvalidArgumentError } from "../../error/invalid-argument-error";

import { DeviceModel } from "./device-model";
import { Platform } from "./platform";
import { PlatformName } from "./platform-name";

export type RequestedPlatformParams = {
    // A concrete platform (`android`, `ubuntu`) or a W3C family word (`linux`).
    readonly name?: string;
    // Leading version segments ("14" opens "14.0.1").
    readonly version?: string;
    // The device kind, typed any way (`Pixel 7`, `pixel_7`); folded to the canonical id.
    readonly deviceModel?: string;
};

// The W3C `platformName` family words a session may send: a family is not a platform (it has no version
// of its own), it opens onto the concrete platforms of that family — every linux this install runs.
const platformFamilies: ReadonlyMap<string, ReadonlyArray<PlatformName>> = new Map([
    ["linux", [PlatformName.Ubuntu]],
]);

// What a session asks for as its platform, each part optional and independent: the platform (a
// concrete one or a family word, expanded once into the concrete platforms it admits so allocation only
// ever compares names), a version prefix, and a device kind. Absent parts constrain nothing. The words
// as asked are kept for the refusal messages the caller reads back.
export class RequestedPlatform {
    static create(params: RequestedPlatformParams): RequestedPlatform {
        return new RequestedPlatform(
            params.name ?? null,
            params.name === undefined ? null : RequestedPlatform.expand(params.name),
            params.version ?? null,
            params.deviceModel === undefined ? null : DeviceModel.fromWord(params.deviceModel),
        );
    }

    static any(): RequestedPlatform {
        return RequestedPlatform.create({});
    }

    private static expand(word: string): ReadonlyArray<PlatformName> {
        const concrete = Object.values(PlatformName).find((candidate) => candidate === word);

        if (concrete) {
            return [concrete];
        }

        const family = platformFamilies.get(word);

        if (family) {
            return family;
        }

        throw new InvalidArgumentError(
            `platform: ${word}: unknown (one of ${[...Object.values(PlatformName), ...platformFamilies.keys()].join(", ")})`,
        );
    }

    private constructor(
        private readonly word: string | null,
        private readonly _names: ReadonlyArray<PlatformName> | null,
        private readonly _versionAsk: string | null,
        private readonly _deviceModel: DeviceModel | null,
    ) {}

    // The concrete platforms admitted; null when the platform was not asked.
    get names(): ReadonlyArray<PlatformName> | null {
        return this._names;
    }

    get versionAsk(): string | null {
        return this._versionAsk;
    }

    get deviceModel(): string | null {
        return this._deviceModel?.getValue() ?? null;
    }

    matches(platform: Platform): boolean {
        return (this._names === null || this._names.includes(platform.name))
            && (this._versionAsk === null || platform.matchesVersionPrefix(this._versionAsk))
            && (this._deviceModel === null || platform.isDevice(this._deviceModel));
    }

    // The ask as the caller phrased it ("android 14 pixel-7"); empty when nothing was asked.
    describe(): string {
        return [this.word, this._versionAsk, this.deviceModel]
            .filter((part): part is string => part !== null)
            .join(" ");
    }
}
