import { DeviceModel } from "../environment/platform/device-model";
import { Platform } from "../environment/platform/platform";

import { DeviceModelRequiredError } from "./error/device-model-required-error";
import { UnsupportedDeviceModelError } from "./error/unsupported-device-model-error";
import { UnsupportedPlatformError } from "./error/unsupported-platform-error";

export type DeviceLine = {
    readonly id: string;
    readonly displayName: string;
};

export type PlatformLine = {
    readonly name: string;
    readonly versions: ReadonlyArray<string>;
    readonly devices: ReadonlyArray<DeviceLine>;
};

export type PlatformCatalogData = {
    platforms: Array<{ name: string; versions: Array<string>; devices: Array<{ id: string; displayName: string }> }>;
};

// The platform base-image lines this install provisions — an environment's platform must name one
// honestly: an OS version the line has, on a device kind the line offers (a hardware profile a virtual
// environment can wear, a model a physical one can be). Install infrastructure, not project data:
// users deliver applications ONTO platforms, they do not add platforms. Static, built at the
// composition root.
export class PlatformCatalog {
    static fromObject(data: PlatformCatalogData): PlatformCatalog {
        return new PlatformCatalog(new Map(data.platforms.map((platform) => [platform.name, {
            name: platform.name,
            versions: [...platform.versions],
            devices: platform.devices.map((device) => ({ id: device.id, displayName: device.displayName })),
        }])));
    }

    private constructor(private readonly linesByName: Map<string, PlatformLine>) {}

    ensurePlatformSupported(platform: Platform): void {
        const line = this.linesByName.get(platform.name);

        if (!line || !line.versions.includes(platform.version)) {
            throw new UnsupportedPlatformError(platform.name, platform.version, line?.versions ?? []);
        }

        if (!line.devices.some((device) => device.id === platform.deviceModel)) {
            throw new UnsupportedDeviceModelError(platform.name, platform.deviceModel, line.devices.map((device) => device.id));
        }
    }

    // The device kind an environment is created as: the word typed, folded to its id and checked
    // against the line; or, when nothing was typed, the line's only device — a line offering several
    // kinds makes the caller choose.
    resolveDeviceModel(platformName: string, word: string | undefined): DeviceModel {
        const devices = this.linesByName.get(platformName)?.devices ?? [];
        const ids = devices.map((device) => device.id);

        if (word === undefined) {
            if (devices.length !== 1) {
                throw new DeviceModelRequiredError(platformName, ids);
            }

            return new DeviceModel(devices[0].id);
        }

        const model = DeviceModel.fromWord(word);

        if (!ids.includes(model.getValue())) {
            throw new UnsupportedDeviceModelError(platformName, model.getValue(), ids);
        }

        return model;
    }

    has(name: string): boolean {
        return this.linesByName.has(name);
    }

    lines(): ReadonlyArray<PlatformLine> {
        return [...this.linesByName.values()].map((line) => PlatformCatalog.copy(line));
    }

    line(name: string): PlatformLine | null {
        const line = this.linesByName.get(name);

        return line ? PlatformCatalog.copy(line) : null;
    }

    private static copy(line: PlatformLine): PlatformLine {
        return { name: line.name, versions: [...line.versions], devices: line.devices.map((device) => ({ ...device })) };
    }
}
