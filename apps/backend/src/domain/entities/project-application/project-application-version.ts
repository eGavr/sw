import { ApplicationVersion, latestApplicationVersion } from "../environment/application/application-version";
import { NonConcreteApplicationVersionError } from "../environment/error/non-concrete-application-version-error";
import { InvalidArgumentError } from "../error/invalid-argument-error";

export type ProjectApplicationVersionData = {
    alias: string;
    version?: string | null;
    appRef?: string | null;
    webdriverRef?: string | null;
    createdAt: Date;
};

export type ProjectApplicationVersionCreateParams = {
    alias: string;
    version?: string;
    appRef?: string;
    webdriverRef?: string;
};

// One registered build of a project application. Everything a human declares is an alias, so the
// build's id is a free-form LABEL of the owner's choosing ("152", "7.1-rc2"); only the catalog also
// declares the exact full version (its trusted source knows it, and delivery measures it as a
// cross-check) — a custom's true version exists only as measured, on the environment. The refs say
// where the artifacts live: the install's own store for the catalog, the project's delegated bucket
// for a custom; no refs = preinstalled on the platform image. A webdriver ref without an app ref is
// meaningless — the webdriver is PAIRED to a build.
export class ProjectApplicationVersion {
    static create(params: ProjectApplicationVersionCreateParams): ProjectApplicationVersion {
        if (params.alias.trim() === "" || params.alias.toLowerCase() === latestApplicationVersion) {
            throw new InvalidArgumentError(`build alias: "${params.alias}" is reserved`);
        }

        if (params.version !== undefined && params.version.toLowerCase() === latestApplicationVersion) {
            throw new NonConcreteApplicationVersionError(params.version);
        }

        if (params.webdriverRef !== undefined && params.appRef === undefined) {
            throw new InvalidArgumentError("a webdriver ref requires an app ref — it is paired to a build");
        }

        return new ProjectApplicationVersion(
            params.alias,
            params.version ?? null,
            params.appRef ?? null,
            params.webdriverRef ?? null,
            new Date(),
        );
    }

    static fromObject(data: ProjectApplicationVersionData): ProjectApplicationVersion {
        return new ProjectApplicationVersion(
            data.alias,
            data.version ?? null,
            data.appRef ?? null,
            data.webdriverRef ?? null,
            data.createdAt,
        );
    }

    private constructor(
        private readonly _alias: string,
        private readonly _version: string | null,
        private readonly _appRef: string | null,
        private readonly _webdriverRef: string | null,
        readonly createdAt: Date,
    ) {}

    get alias(): string {
        return this._alias;
    }

    // The declared exact full version — catalog builds only; a custom's truth is measured, not declared.
    get version(): string | null {
        return this._version;
    }

    get appRef(): string | null {
        return this._appRef;
    }

    get webdriverRef(): string | null {
        return this._webdriverRef;
    }

    // Every word this build answers to when a version is asked for.
    words(): Array<string> {
        return this._version !== null ? [this._alias, this._version] : [this._alias];
    }

    // A version ask matches this build by its alias, its declared full version, or a segment prefix of
    // that full version ("152" opens "152.0.7977.82").
    matchesAsk(ask: string): boolean {
        if (this._alias === ask) {
            return true;
        }

        return this._version !== null && new ApplicationVersion(this._version).matchesPrefix(ask);
    }

    // Newest first: declared full versions compare honestly; an undeclared build (custom) orders by
    // registration time, and a declared one outranks an undeclared one (the catalog knows, the custom
    // is measured later).
    isNewerThan(other: ProjectApplicationVersion): boolean {
        if (this._version !== null && other._version !== null) {
            return new ApplicationVersion(this._version).compareTo(new ApplicationVersion(other._version)) > 0;
        }

        if (this._version === null && other._version === null) {
            return this.createdAt.getTime() > other.createdAt.getTime();
        }

        return this._version !== null;
    }

    toObject(): ProjectApplicationVersionData {
        return {
            alias: this._alias,
            version: this._version,
            appRef: this._appRef,
            webdriverRef: this._webdriverRef,
            createdAt: this.createdAt,
        };
    }
}
