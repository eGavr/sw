import { Platform } from "../environment/platform/platform";

import { UnsupportedPlatformError } from "./error/unsupported-platform-error";

export type PlatformLine = {
    readonly name: string;
    readonly versions: ReadonlyArray<string>;
};

export type PlatformCatalogData = {
    platforms: Array<{ name: string; versions: Array<string> }>;
};

// The platform base-image lines this install provisions — an environment's platform must name one
// honestly. Install infrastructure, not project data: users deliver applications ONTO platforms, they
// do not add platforms. Static, built at the composition root.
export class PlatformCatalog {
    static fromObject(data: PlatformCatalogData): PlatformCatalog {
        return new PlatformCatalog(new Map(data.platforms.map((platform) => [platform.name, platform.versions])));
    }

    private constructor(private readonly versionsByName: Map<string, Array<string>>) {}

    ensurePlatformSupported(platform: Platform): void {
        const versions = this.versionsByName.get(platform.name) ?? [];

        if (!versions.includes(platform.version)) {
            throw new UnsupportedPlatformError(platform.name, platform.version, versions);
        }
    }

    has(name: string): boolean {
        return this.versionsByName.has(name);
    }

    lines(): ReadonlyArray<PlatformLine> {
        return [...this.versionsByName].map(([name, versions]) => ({ name, versions: [...versions] }));
    }

    line(name: string): PlatformLine | null {
        const versions = this.versionsByName.get(name);

        return versions ? { name, versions: [...versions] } : null;
    }
}
