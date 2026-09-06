import { ApplicationVersion, latestApplicationVersion } from "../environment/application/application-version";
import { NonConcreteApplicationVersionError } from "../environment/error/non-concrete-application-version-error";
import { InvalidArgumentError } from "../error/invalid-argument-error";

export type ProjectApplicationVersionData = {
    version: string;
    appRef?: string | null;
    webdriverRef?: string | null;
};

export type ProjectApplicationVersionCreateParams = {
    version: string;
    appRef?: string;
    webdriverRef?: string;
};

// One registered build of a project application: an honest FULL version plus where its artifacts live —
// for a user project, object keys in the project's delegated bucket; for the catalog project, refs into
// the install's own store. No refs means preinstalled on the platform image (nothing to deliver). A
// webdriver ref without an app ref is meaningless — the webdriver is PAIRED to a build.
export class ProjectApplicationVersion {
    static create(params: ProjectApplicationVersionCreateParams): ProjectApplicationVersion {
        if (params.version.toLowerCase() === latestApplicationVersion) {
            throw new NonConcreteApplicationVersionError(params.version);
        }

        if (params.webdriverRef !== undefined && params.appRef === undefined) {
            throw new InvalidArgumentError("a webdriver ref requires an app ref — it is paired to a build");
        }

        return new ProjectApplicationVersion(
            new ApplicationVersion(params.version),
            params.appRef ?? null,
            params.webdriverRef ?? null,
        );
    }

    static fromObject(data: ProjectApplicationVersionData): ProjectApplicationVersion {
        return new ProjectApplicationVersion(
            new ApplicationVersion(data.version),
            data.appRef ?? null,
            data.webdriverRef ?? null,
        );
    }

    private constructor(
        private readonly _version: ApplicationVersion,
        private readonly _appRef: string | null,
        private readonly _webdriverRef: string | null,
    ) {}

    get version(): string {
        return this._version.getValue();
    }

    get appRef(): string | null {
        return this._appRef;
    }

    get webdriverRef(): string | null {
        return this._webdriverRef;
    }

    matchesPrefix(prefix: string): boolean {
        return this._version.matchesPrefix(prefix);
    }

    isNewerThan(other: ProjectApplicationVersion): boolean {
        return this._version.compareTo(other._version) > 0;
    }

    toObject(): ProjectApplicationVersionData {
        return {
            version: this.version,
            appRef: this._appRef,
            webdriverRef: this._webdriverRef,
        };
    }
}
