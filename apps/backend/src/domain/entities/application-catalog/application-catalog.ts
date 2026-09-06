import { Application } from "../environment/application/application";
import { ApplicationMatch } from "../environment/application/application-match";
import { ApplicationSource } from "../environment/application/application-source";
import { RequestedApplication } from "../environment/application/requested-application";
import { Platform } from "../environment/platform/platform";

import { ApplicationNotInCatalogError } from "./error/application-not-in-catalog-error";
import { UnsupportedPlatformError } from "./error/unsupported-platform-error";
import { ProvidedApplication, ProvidedApplicationData } from "./provided-application";

export type ApplicationCatalogData = {
    platforms: Array<{ name: string; versions: Array<string> }>;
    applications: Array<ProvidedApplicationData>;
};

// What this install can put onto an environment: the platform base-image lines it provisions (an
// environment's platform must name one honestly) and the applications the service itself delivers,
// each a canonical reverse-DNS id at one FULL version with its wire aliases. Static install data built
// at the composition root; a custom (user-artifact) application bypasses it entirely.
export class ApplicationCatalog {
    static fromObject(data: ApplicationCatalogData): ApplicationCatalog {
        return new ApplicationCatalog(
            new Map(data.platforms.map((platform) => [platform.name, platform.versions])),
            data.applications.map(ProvidedApplication.fromObject),
        );
    }

    private constructor(
        private readonly platformVersions: Map<string, Array<string>>,
        private readonly applications: Array<ProvidedApplication>,
    ) {}

    ensurePlatformSupported(platform: Platform): void {
        const versions = this.platformVersions.get(platform.name) ?? [];

        if (!versions.includes(platform.version)) {
            throw new UnsupportedPlatformError(platform.name, platform.version, versions);
        }
    }

    // Resolves a create-environment ask — an alias or canonical name with a loose version (segment
    // prefix, "latest" or omitted) — into the concrete provided application to install: canonical name,
    // full version (newest when several qualify).
    resolveProvided(platformName: string, requested: RequestedApplication): Application {
        const candidates = this.applications.filter((application) =>
            application.platform === platformName
            && application.answersTo(requested.name)
            && application.matchesVersion(requested.version()));

        if (candidates.length === 0) {
            throw new ApplicationNotInCatalogError(platformName, requested.name, requested.version());
        }

        const newest = candidates.reduce((best, candidate) => (candidate.isNewerThan(best) ? candidate : best));

        return Application.create({
            name: newest.name,
            version: newest.version,
            source: ApplicationSource.provided(),
        });
    }

    // Expands a session ask into every name it may be installed under: the requested name itself (a
    // canonical id or a custom application's own name) plus each canonical id the catalog knows the
    // word as an alias of — across platforms; narrowing by platform is the allocation's business.
    expand(requested: RequestedApplication): ApplicationMatch {
        const aliased = this.applications
            .filter((application) => application.answersTo(requested.name))
            .map((application) => application.name);

        return ApplicationMatch.create({
            names: [requested.name, ...aliased],
            versionPrefix: requested.version(),
        });
    }

    // The wire vocabulary word for a canonical name (`com.google.chrome` → `chrome`) — what a browser
    // node actually understands as browserName. Unknown names pass through: a custom application is
    // addressed as-is.
    wireName(canonicalName: string): string {
        const known = this.applications.find((application) => application.name === canonicalName);

        return known ? known.wireName() : canonicalName;
    }

    providedFor(platformName: string, name: string, version: string): ProvidedApplication | null {
        return this.applications.find((application) =>
            application.platform === platformName
            && application.name === name
            && application.version === version) ?? null;
    }
}
