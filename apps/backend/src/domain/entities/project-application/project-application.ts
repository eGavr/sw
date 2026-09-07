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
// project these are the install's provided applications — a canonical id plus wire aliases (`chrome`),
// declared by the install, the one trusted source. In a user project the `name` is just the user's
// ONE addressing word (the docker rule: short catalog words belong to the install): it claims no
// identity — an APK's honest package id and version are DETECTED at delivery and land next to the
// word. Versions are its builds, each pointing at its artifacts; a build's label is the user's picking
// handle, the detected version is the truth.
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
        // Registration order is the aggregate's ordering axis; rows arrive from storage unordered.
        const versions = data.versions.map(ProjectApplicationVersion.fromObject)
            .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

        return new ProjectApplication(
            data.id,
            data.projectId,
            data.platformName,
            new ApplicationName(data.name),
            data.aliases,
            versions,
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

    // Registration time is the ordering axis ("newest" = last registered), so it is kept strictly
    // monotonic within the aggregate — batch registrations land in the same millisecond otherwise.
    addVersion(params: ProjectApplicationVersionCreateParams): ProjectApplicationVersion {
        if (this._versions.some((existing) => existing.alias === params.alias)) {
            throw new ApplicationVersionConflictError(this.name, params.alias);
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

    versionOf(alias: string): ProjectApplicationVersion | null {
        return this._versions.find((existing) => existing.alias === alias) ?? null;
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
            name: this.name,
            aliases: [...this._aliases],
            versions: this._versions.map((version) => version.toObject()),
            createdAt: this.createdAt,
        };
    }
}
