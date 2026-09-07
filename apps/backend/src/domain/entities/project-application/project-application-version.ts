import { Uuid } from "../../types/uuid/uuid";
import { latestApplicationVersion } from "../environment/application/application-version";
import { InvalidArgumentError } from "../error/invalid-argument-error";

export type ProjectApplicationVersionData = {
    id: string;
    versionAlias: string;
    appRef?: string | null;
    webdriverRef?: string | null;
    createdAt: Date;
};

export type ProjectApplicationVersionCreateParams = {
    versionAlias: string;
    appRef?: string;
    webdriverRef?: string;
    createdAt?: Date;
};

// One registered build of a project application: a resource with its own id, addressed by the
// owner's free-form version ALIAS ("152", "7.1-rc2") — nobody declares a version, not even the
// catalog: the honest version exists only as detected on the device, and it is always there by the
// time anything is allocatable (detection rides the registration heartbeat). The refs say where the
// artifacts live: the install's own store for the catalog, the project's delegated bucket for a
// custom; no app ref = preinstalled on the platform image — which may still bring the webdriver that
// drives it (the image's browser and the chromedriver of its version, run on the host).
export class ProjectApplicationVersion {
    static create(params: ProjectApplicationVersionCreateParams): ProjectApplicationVersion {
        if (params.versionAlias.trim() === "" || params.versionAlias.toLowerCase() === latestApplicationVersion) {
            throw new InvalidArgumentError(`version alias: "${params.versionAlias}" is reserved`);
        }

        return new ProjectApplicationVersion(
            Uuid.create().getValue(),
            params.versionAlias,
            params.appRef ?? null,
            params.webdriverRef ?? null,
            params.createdAt ?? new Date(),
        );
    }

    static fromObject(data: ProjectApplicationVersionData): ProjectApplicationVersion {
        return new ProjectApplicationVersion(
            data.id,
            data.versionAlias,
            data.appRef ?? null,
            data.webdriverRef ?? null,
            data.createdAt,
        );
    }

    private constructor(
        readonly id: string,
        private readonly _versionAlias: string,
        private readonly _appRef: string | null,
        private readonly _webdriverRef: string | null,
        readonly createdAt: Date,
    ) {}

    get versionAlias(): string {
        return this._versionAlias;
    }

    get appRef(): string | null {
        return this._appRef;
    }

    get webdriverRef(): string | null {
        return this._webdriverRef;
    }

    matchesAsk(ask: string): boolean {
        return this._versionAlias === ask;
    }

    // Newest first = registration order: the owner (a user or the baking pipeline) registers builds as
    // they appear. Re-registering an OLD build later would make it "newest" — the owner's label
    // discipline, honestly documented, not our guess about version shapes.
    isNewerThan(other: ProjectApplicationVersion): boolean {
        return this.createdAt.getTime() > other.createdAt.getTime();
    }

    toObject(): ProjectApplicationVersionData {
        return {
            id: this.id,
            versionAlias: this._versionAlias,
            appRef: this._appRef,
            webdriverRef: this._webdriverRef,
            createdAt: this.createdAt,
        };
    }
}
