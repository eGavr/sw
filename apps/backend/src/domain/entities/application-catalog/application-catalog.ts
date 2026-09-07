import { Application } from "../environment/application/application";
import { ApplicationMatch } from "../environment/application/application-match";
import { ApplicationSource } from "../environment/application/application-source";
import { RequestedApplication } from "../environment/application/requested-application";
import { ProjectApplication } from "../project-application/project-application";
import { ProjectApplicationVersion } from "../project-application/project-application-version";

import { ApplicationNotInCatalogError } from "./error/application-not-in-catalog-error";

export type ApplicationCatalogParams = {
    // The reserved catalog project's applications — the install's provided set, whose words (canonical
    // names AND aliases) are reserved install-wide.
    catalog: ReadonlyArray<ProjectApplication>;
    // The acting project's own applications — customs, addressed by canonical name only.
    own: ReadonlyArray<ProjectApplication>;
};

// The applications one project can put onto an environment: the install's provided set plus its own
// registered customs, under the docker rule — a catalog word means the same thing in EVERY project, a
// custom never takes one, so every word resolves deterministically: catalog first, then the project's
// canonical names.
export class ApplicationCatalog {
    static of(params: ApplicationCatalogParams): ApplicationCatalog {
        return new ApplicationCatalog(params.catalog, params.own);
    }

    private constructor(
        private readonly catalog: ReadonlyArray<ProjectApplication>,
        private readonly own: ReadonlyArray<ProjectApplication>,
    ) {}

    // Resolves a create-environment ask — a loose word with a loose version (segment prefix, "latest"
    // or omitted) — into the concrete application to install, carrying the build's artifact refs so the
    // environment can snapshot them and stay self-contained.
    resolve(platformName: string, requested: RequestedApplication): Application {
        const application = this.applicationAnswering(platformName, requested.name);

        if (!application) {
            throw new ApplicationNotInCatalogError(platformName, requested.name, requested.version());
        }

        const build = application.newestMatching(requested.version());

        if (!build) {
            throw new ApplicationNotInCatalogError(platformName, requested.name, requested.version());
        }

        return Application.create({
            name: application.name,
            version: build.version,
            source: this.sourceFor(application, build),
        });
    }

    // Expands a session ask into every name it may be installed under: the requested word itself (a
    // canonical id — catalog, custom or a legacy install) plus each catalog canonical the word aliases,
    // across platforms; narrowing by platform is the allocation's business.
    expand(requested: RequestedApplication): ApplicationMatch {
        const aliased = this.catalog
            .filter((application) => application.answersTo(requested.name))
            .map((application) => application.name);

        return ApplicationMatch.create({
            names: [requested.name, ...aliased],
            versionPrefix: requested.version(),
        });
    }

    // The wire vocabulary word for a canonical name (`com.android.chrome` → `chrome`) — what a browser
    // node actually understands as browserName. Customs pass through: they are addressed as-is.
    wireName(canonicalName: string): string {
        const known = this.catalog.find((application) => application.name === canonicalName);

        return known ? (known.aliases[0] ?? known.name) : canonicalName;
    }

    // Whether a word is taken on the platform — by the install catalog (reserved everywhere) or within
    // the given set. Registration uses both: a custom may not take a catalog word, and no two
    // applications of one project may share a word.
    catalogReserves(platformName: string, word: string): boolean {
        return this.catalog.some((application) =>
            application.platformName === platformName && application.answersTo(word));
    }

    ownAnswers(platformName: string, word: string): boolean {
        return this.own.some((application) =>
            application.platformName === platformName && application.answersTo(word));
    }

    private applicationAnswering(platformName: string, word: string): ProjectApplication | null {
        const provided = this.catalog.find((application) =>
            application.platformName === platformName && application.answersTo(word));

        if (provided) {
            return provided;
        }

        return this.own.find((application) =>
            application.platformName === platformName && application.name === word) ?? null;
    }

    private sourceFor(application: ProjectApplication, build: ProjectApplicationVersion): ApplicationSource {
        const refs = {
            appRef: build.appRef ?? undefined,
            webdriverRef: build.webdriverRef ?? undefined,
        };

        return this.catalog.includes(application)
            ? ApplicationSource.provided(refs)
            : ApplicationSource.custom(refs);
    }
}
