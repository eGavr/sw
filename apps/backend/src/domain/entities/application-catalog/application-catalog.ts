import { Application } from "../environment/application/application";
import { ApplicationSource } from "../environment/application/application-source";
import { RequestedApplication } from "../environment/application/requested-application";
import { ProjectApplication } from "../project-application/project-application";
import { ProjectApplicationVersion } from "../project-application/project-application-version";

import { ApplicationNotInCatalogError } from "./error/application-not-in-catalog-error";

export type ApplicationCatalogParams = {
    // The reserved catalog project's applications — the install's provided set, the defaults every
    // project starts from.
    catalog: ReadonlyArray<ProjectApplication>;
    // The acting project's own applications — its customs, overriding the catalog's word for word.
    own: ReadonlyArray<ProjectApplication>;
};

// The applications one project can put onto an environment: its own registrations first, the
// install's provided set behind them — the catalog is what a project gets by default, and a project
// may override any of it under the same word (its own chrome build wins over the catalog's). A word
// resolves deterministically: the project's own, then the catalog.
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
            nameAlias: application.nameAlias,
            versionAlias: build.versionAlias,
            source: this.sourceFor(application, build),
        });
    }

    // Whether the project's own set already answers to a word on the platform — no two applications of
    // one project may share a word.
    ownAnswers(platformName: string, word: string): boolean {
        return this.own.some((application) => application.platformName === platformName && application.nameAlias === word);
    }

    private applicationNamed(platformName: string, word: string): ProjectApplication | null {
        const named = (application: ProjectApplication): boolean =>
            application.platformName === platformName && application.nameAlias === word;

        return this.own.find(named) ?? this.catalog.find(named) ?? null;
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
