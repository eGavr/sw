import { Uuid } from "../../types/uuid/uuid";
import { ApplicationName } from "../environment/application/application-name";
import { InvalidArgumentError } from "../error/invalid-argument-error";

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
    name: string;
    aliases: Array<string>;
    versions: Array<ProjectApplicationVersionData>;
    createdAt: Date;
};

export type ProjectApplicationCreateParams = {
    projectId: string;
    platformName: string;
    name: string;
    aliases?: Array<string>;
};

// An application registered in a project: the unit both catalogs are made of. In the reserved catalog
// project these are the install's provided applications (with wire aliases — `chrome`); in a user
// project they are the customs, addressed by canonical name only (the docker rule: short words belong
// to the install). Versions are its builds, each pointing at its artifacts.
export class ProjectApplication {
    static create(params: ProjectApplicationCreateParams): ProjectApplication {
        const aliases = params.aliases ?? [];

        for (const alias of aliases) {
            new ApplicationName(alias);
        }

        return new ProjectApplication(
            Uuid.create().getValue(),
            params.projectId,
            params.platformName,
            new ApplicationName(params.name),
            aliases,
            [],
            new Date(),
        );
    }

    static fromObject(data: ProjectApplicationData): ProjectApplication {
        return new ProjectApplication(
            data.id,
            data.projectId,
            data.platformName,
            new ApplicationName(data.name),
            data.aliases,
            data.versions.map(ProjectApplicationVersion.fromObject),
            data.createdAt,
        );
    }

    private constructor(
        readonly id: string,
        readonly projectId: string,
        readonly platformName: string,
        private readonly _name: ApplicationName,
        private readonly _aliases: ReadonlyArray<string>,
        private readonly _versions: Array<ProjectApplicationVersion>,
        readonly createdAt: Date,
    ) {
        if (new Set(this.words()).size !== this.words().length) {
            throw new InvalidArgumentError(`application ${this._name.getValue()}: duplicate words`);
        }
    }

    get name(): string {
        return this._name.getValue();
    }

    get aliases(): ReadonlyArray<string> {
        return this._aliases;
    }

    // Every word this application answers to: its canonical name plus its wire aliases.
    words(): Array<string> {
        return [this.name, ...this._aliases];
    }

    answersTo(word: string): boolean {
        return this.words().includes(word);
    }

    addVersion(params: ProjectApplicationVersionCreateParams): ProjectApplicationVersion {
        if (this._versions.some((existing) => existing.version === params.version)) {
            throw new ApplicationVersionConflictError(this.name, params.version);
        }

        const version = ProjectApplicationVersion.create(params);

        this._versions.push(version);

        return version;
    }

    versionsNewestFirst(): ReadonlyArray<ProjectApplicationVersion> {
        return [...this._versions].sort((left, right) => (left.isNewerThan(right) ? -1 : 1));
    }

    versionOf(version: string): ProjectApplicationVersion | null {
        return this._versions.find((existing) => existing.version === version) ?? null;
    }

    // The newest build satisfying a loose ask: a segment prefix, or null meaning "the newest there is".
    newestMatching(versionPrefix: string | null): ProjectApplicationVersion | null {
        const matching = versionPrefix === null
            ? this._versions
            : this._versions.filter((candidate) => candidate.matchesPrefix(versionPrefix));

        if (matching.length === 0) {
            return null;
        }

        return matching.reduce((best, candidate) => (candidate.isNewerThan(best) ? candidate : best));
    }

    toObject(): ProjectApplicationData {
        return {
            id: this.id,
            projectId: this.projectId,
            platformName: this.platformName,
            name: this.name,
            aliases: [...this._aliases],
            versions: this._versions.map((version) => version.toObject()),
            createdAt: this.createdAt,
        };
    }
}
