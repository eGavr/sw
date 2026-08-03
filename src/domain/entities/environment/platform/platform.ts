import { InvalidArgumentError } from "../../error/invalid-argument-error";

import { PlatformName } from "./platform-name";
import { PlatformVersion } from "./platform-version";

export type PlatformData = {
    name: string;
    version: string;
    deviceModel?: string | null;
};

export type PlatformCreateParams = {
    name: PlatformName;
    version: string;
    deviceModel?: string;
};

export class Platform {
    static create(params: PlatformCreateParams): Platform {
        return new Platform(params.name, new PlatformVersion(params.version), params.deviceModel ?? null);
    }

    static fromObject(data: PlatformData): Platform {
        return Platform.create({
            name: Platform.toName(data.name),
            version: data.version,
            deviceModel: data.deviceModel ?? undefined,
        });
    }

    private static toName(value: string): PlatformName {
        const name = Object.values(PlatformName).find((candidate) => candidate === value);

        if (!name) {
            throw new InvalidArgumentError(`platform name: ${value}: unknown`);
        }

        return name;
    }

    private readonly _name: PlatformName;
    private readonly _version: PlatformVersion;
    private readonly _deviceModel: string | null;

    private constructor(name: PlatformName, version: PlatformVersion, deviceModel: string | null) {
        this._name = name;
        this._version = version;
        this._deviceModel = deviceModel;
    }

    get name(): PlatformName {
        return this._name;
    }

    get version(): string {
        return this._version.getValue();
    }

    get deviceModel(): string | null {
        return this._deviceModel;
    }

    equals(other: Platform): boolean {
        return this._name === other._name && this.version === other.version && this._deviceModel === other._deviceModel;
    }

    toObject(): PlatformData {
        return {
            name: this._name,
            version: this.version,
            deviceModel: this._deviceModel,
        };
    }
}
