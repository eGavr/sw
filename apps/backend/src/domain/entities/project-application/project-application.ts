import { Uuid } from "../../types/uuid/uuid";
import { ApplicationName } from "../environment/application/application-name";

import { ApplicationVersionConflictError } from "./error/application-version-conflict-error";
import {
    ProjectApplicationVersion,
    ProjectApplicationVersionCreateParams,
    ProjectApplicationVersionData,
} from "./project-application-version";

export type ProjectApplicationData = {
    id: string;
    projectId: string;
    platformName: string;
    nameAlias: string;
    versions: Array<ProjectApplicationVersionData>;
    createdAt: Date;
};

export type ProjectApplicationCreateParams = {
    projectId: string;
    platformName: string;
    nameAlias: string;
};

// An application registered in a project: the unit both catalogs are made of, the same shape whoever
// owns it. The resource is its server-minted id; its NAME ALIAS is the one addressing word — `chrome`,
// `settings`, `myapp` — unique per project and platform, claiming no identity: an APK's honest package
// id and version are DETECTED at delivery and land next to the word on the environment. The reserved
// catalog project's words are reserved install-wide (the docker rule), a user project's words are its
// own. Versions are its builds, each pointing at its artifacts; a build's label is the picking handle,
// the detected version is the truth.
export class ProjectApplication {
    static create(params: ProjectApplicationCreateParams): ProjectApplication {
        return new ProjectApplication(
            Uuid.create().getValue(),
            params.projectId,
            params.platformName,
            new ApplicationName(params.nameAlias),
            [],
            new Date(),
        );
    }

    static fromObject(data: ProjectApplicationData): ProjectApplication {
        // Registration order is the aggregate's ordering axis; rows arrive from storage unordered.
        const versions = data.versions.map(ProjectApplicationVersion.fromObject)
            .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

        return new ProjectApplication(
            data.id,
            data.projectId,
            data.platformName,
            new ApplicationName(data.nameAlias),
            versions,
            data.createdAt,
        );
    }

    private constructor(
        readonly id: string,
        readonly projectId: string,
        readonly platformName: string,
        private readonly _nameAlias: ApplicationName,
        private readonly _versions: Array<ProjectApplicationVersion>,
        readonly createdAt: Date,
    ) {}

    get nameAlias(): string {
        return this._nameAlias.getValue();
    }

    // Registration time is the ordering axis ("newest" = last registered), so it is kept strictly
    // monotonic within the aggregate — batch registrations land in the same millisecond otherwise.
    addVersion(params: ProjectApplicationVersionCreateParams): ProjectApplicationVersion {
        if (this._versions.some((existing) => existing.versionAlias === params.versionAlias)) {
            throw new ApplicationVersionConflictError(this.nameAlias, params.versionAlias);
        }

        const last = this._versions[this._versions.length - 1];
        const createdAt = new Date(Math.max(Date.now(), last ? last.createdAt.getTime() + 1 : 0));
        const version = ProjectApplicationVersion.create({ ...params, createdAt });

        this._versions.push(version);

        return version;
    }

    versionsNewestFirst(): ReadonlyArray<ProjectApplicationVersion> {
        return [...this._versions].sort((left, right) => (left.isNewerThan(right) ? -1 : 1));
    }

    versionOf(versionAlias: string): ProjectApplicationVersion | null {
        return this._versions.find((existing) => existing.versionAlias === versionAlias) ?? null;
    }

    // The newest build satisfying an ask: a build alias, or null meaning "the newest there is".
    newestMatching(ask: string | null): ProjectApplicationVersion | null {
        const matching = ask === null
            ? this._versions
            : this._versions.filter((candidate) => candidate.matchesAsk(ask));

        if (matching.length === 0) {
            return null;
        }

        // Ties (same-millisecond batch registrations) go to the later entry — registration order.
        return matching.reduce((best, candidate) => (best.isNewerThan(candidate) ? best : candidate));
    }

    toObject(): ProjectApplicationData {
        return {
            id: this.id,
            projectId: this.projectId,
            platformName: this.platformName,
            nameAlias: this.nameAlias,
            versions: this._versions.map((version) => version.toObject()),
            createdAt: this.createdAt,
        };
    }
}
