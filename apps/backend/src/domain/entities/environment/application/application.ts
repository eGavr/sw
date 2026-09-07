import { ApplicationName } from "./application-name";
import { ApplicationSource, ApplicationSourceData } from "./application-source";
import { ApplicationVersion } from "./application-version";

export type ApplicationData = {
    name: string;
    buildAlias?: string | null;
    detectedName?: string | null;
    detectedVersion?: string | null;
    source?: ApplicationSourceData;
};

export type ApplicationCreateParams = {
    name: string;
    buildAlias?: string;
    source?: ApplicationSource;
};

// An application installed on an environment, in two layers. Declared (snapshotted at creation): the
// WORD it was asked by and the picked build's alias — nothing more, declared identity can lie.
// Detected (reported by the agent once the build lands on the device): the honest identity read from
// the artifact itself — an APK's package id and versionName. Detection rides the registration
// heartbeat, so by the time the environment is allocatable the detected layer is there.
export class Application {
    static create(params: ApplicationCreateParams): Application {
        return new Application(
            new ApplicationName(params.name),
            params.buildAlias ?? null,
            null,
            null,
            params.source ?? ApplicationSource.provided(),
        );
    }

    static fromObject(data: ApplicationData): Application {
        return new Application(
            new ApplicationName(data.name),
            data.buildAlias ?? null,
            data.detectedName ?? null,
            data.detectedVersion ?? null,
            ApplicationSource.fromObject(data.source),
        );
    }

    private constructor(
        private readonly _name: ApplicationName,
        private readonly _buildAlias: string | null,
        private _detectedName: string | null,
        private _detectedVersion: string | null,
        private readonly _source: ApplicationSource,
    ) {}

    get name(): string {
        return this._name.getValue();
    }

    get buildAlias(): string | null {
        return this._buildAlias;
    }

    get detectedName(): string | null {
        return this._detectedName;
    }

    get detectedVersion(): string | null {
        return this._detectedVersion;
    }

    get source(): ApplicationSource {
        return this._source;
    }

    answersToWord(word: string): boolean {
        return this.name === word || this._detectedName === word;
    }

    // A version ask matches by the picked build's alias, or exactly/segment-prefix against the
    // detected version.
    matchesVersionAsk(ask: string): boolean {
        if (this._buildAlias === ask) {
            return true;
        }

        return this._detectedVersion !== null && new ApplicationVersion(this._detectedVersion).matchesPrefix(ask);
    }

    // The agent's report from the device: the honest identity lands next to the word. Nothing is
    // verified against it — the word is an ADDRESS, not a claim (everything declared is an alias);
    // artifact integrity is the digest check at delivery, not a name comparison.
    applyDetection(detectedName: string | null, detectedVersion: string | null): void {
        this._detectedName = detectedName;
        this._detectedVersion = detectedVersion;
    }

    // Identity is the word plus the picked build; the source refs are provenance.
    equals(other: Application): boolean {
        return this.name === other.name && this._buildAlias === other._buildAlias;
    }

    // Orders by the detected version, newest greater; an application not yet detected ranks below any
    // detected one, ties by nothing (stable sort keeps the load spread).
    compareVersion(other: Application): number {
        const mine = this._detectedVersion;
        const theirs = other._detectedVersion;

        if (mine === null || theirs === null) {
            return mine === theirs ? 0 : (mine === null ? -1 : 1);
        }

        return new ApplicationVersion(mine).compareTo(new ApplicationVersion(theirs));
    }

    toObject(): ApplicationData {
        return {
            name: this.name,
            buildAlias: this._buildAlias,
            detectedName: this._detectedName,
            detectedVersion: this._detectedVersion,
            source: this._source.toObject(),
        };
    }
}
