import { Application } from "../environment/application/application";
import { ApplicationSource } from "../environment/application/application-source";
import { RequestedApplication } from "../environment/application/requested-application";
import { ProjectApplication } from "../project-application/project-application";
import { ProjectApplicationVersion } from "../project-application/project-application-version";

import { ApplicationNotInCatalogError } from "./error/application-not-in-catalog-error";

export type ApplicationCatalogParams = {
    // The reserved catalog project's applications — the install's provided set, whose words are
    // reserved install-wide.
    catalog: ReadonlyArray<ProjectApplication>;
    // The acting project's own applications — its customs.
    own: ReadonlyArray<ProjectApplication>;
};

// The applications one project can put onto an environment: the install's provided set plus its own
// registered customs, under the docker rule — a catalog word means the same thing in EVERY project, a
// custom never takes one, so every word resolves deterministically: catalog first, then the project's
// own words.
export class ApplicationCatalog {
    static of(params: ApplicationCatalogParams): ApplicationCatalog {
        return new ApplicationCatalog(params.catalog, params.own);
    }

    private constructor(
        private readonly catalog: ReadonlyArray<ProjectApplication>,
        private readonly own: ReadonlyArray<ProjectApplication>,
    ) {}

    // Resolves a create-environment ask — a word with a loose version (build alias, "latest" or
    // omitted) — into the concrete application to install, carrying the build's artifact refs so the
    // environment can snapshot them and stay self-contained.
    resolve(platformName: string, requested: RequestedApplication): Application {
        const application = this.applicationNamed(platformName, requested.name);

        if (!application) {
            throw new ApplicationNotInCatalogError(platformName, requested.name, requested.version());
        }

        const build = application.newestMatching(requested.version());

        if (!build) {
            throw new ApplicationNotInCatalogError(platformName, requested.name, requested.version());
        }

        return Application.create({
            nameAlias: application.name,
            versionAlias: build.alias,
            source: this.sourceFor(application, build),
        });
    }

    // Whether a word is taken on the platform — by the install catalog (reserved everywhere) or within
    // the project's own set. Registration uses both: a custom may not take a catalog word, and no two
    // applications of one project may share a word.
    catalogReserves(platformName: string, word: string): boolean {
        return this.catalog.some((application) => application.platformName === platformName && application.name === word);
    }

    ownAnswers(platformName: string, word: string): boolean {
        return this.own.some((application) => application.platformName === platformName && application.name === word);
    }

    private applicationNamed(platformName: string, word: string): ProjectApplication | null {
        const named = (application: ProjectApplication): boolean =>
            application.platformName === platformName && application.name === word;

        return this.catalog.find(named) ?? this.own.find(named) ?? null;
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
