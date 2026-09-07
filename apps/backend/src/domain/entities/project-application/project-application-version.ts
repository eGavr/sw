import { latestApplicationVersion } from "../environment/application/application-version";
import { InvalidArgumentError } from "../error/invalid-argument-error";

export type ProjectApplicationVersionData = {
    alias: string;
    appRef?: string | null;
    webdriverRef?: string | null;
    createdAt: Date;
};

export type ProjectApplicationVersionCreateParams = {
    alias: string;
    appRef?: string;
    webdriverRef?: string;
    createdAt?: Date;
};

// One registered build of a project application. Everything a human declares is an alias, so the
// build IS its free-form LABEL ("152", "7.1-rc2") plus its artifacts — nobody declares a version, not
// even the catalog: the honest version exists only as measured on the device, and it is always there
// by the time anything is allocatable (measurement rides the registration heartbeat). The refs say
// where the artifacts live: the install's own store for the catalog, the project's delegated bucket
// for a custom; no refs = preinstalled on the platform image. A webdriver ref without an app ref is
// meaningless — the webdriver is PAIRED to a build.
export class ProjectApplicationVersion {
    static create(params: ProjectApplicationVersionCreateParams): ProjectApplicationVersion {
        if (params.alias.trim() === "" || params.alias.toLowerCase() === latestApplicationVersion) {
            throw new InvalidArgumentError(`build alias: "${params.alias}" is reserved`);
        }

        if (params.webdriverRef !== undefined && params.appRef === undefined) {
            throw new InvalidArgumentError("a webdriver ref requires an app ref — it is paired to a build");
        }

        return new ProjectApplicationVersion(
            params.alias,
            params.appRef ?? null,
            params.webdriverRef ?? null,
            params.createdAt ?? new Date(),
        );
    }

    static fromObject(data: ProjectApplicationVersionData): ProjectApplicationVersion {
        return new ProjectApplicationVersion(
            data.alias,
            data.appRef ?? null,
            data.webdriverRef ?? null,
            data.createdAt,
        );
    }

    private constructor(
        private readonly _alias: string,
        private readonly _appRef: string | null,
        private readonly _webdriverRef: string | null,
        readonly createdAt: Date,
    ) {}

    get alias(): string {
        return this._alias;
    }

    get appRef(): string | null {
        return this._appRef;
    }

    get webdriverRef(): string | null {
        return this._webdriverRef;
    }

    matchesAsk(ask: string): boolean {
        return this._alias === ask;
    }

    // Newest first = registration order: the owner (a user or the baking pipeline) registers builds as
    // they appear. Re-registering an OLD build later would make it "newest" — the owner's label
    // discipline, honestly documented, not our guess about version shapes.
    isNewerThan(other: ProjectApplicationVersion): boolean {
        return this.createdAt.getTime() > other.createdAt.getTime();
    }

    toObject(): ProjectApplicationVersionData {
        return {
            alias: this._alias,
            appRef: this._appRef,
            webdriverRef: this._webdriverRef,
            createdAt: this.createdAt,
        };
    }
}
