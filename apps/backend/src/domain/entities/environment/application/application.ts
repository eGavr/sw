import { ApplicationName } from "./application-name";
import { ApplicationSource, ApplicationSourceData } from "./application-source";
import { ApplicationVersion } from "./application-version";

export type ApplicationData = {
    name: string;
    buildAlias?: string | null;
    measuredName?: string | null;
    measuredVersion?: string | null;
    source?: ApplicationSourceData;
};

export type ApplicationCreateParams = {
    name: string;
    buildAlias?: string;
    source?: ApplicationSource;
};

// An application installed on an environment, in two layers. Declared (snapshotted at creation): the
// WORD it was asked by and the picked build's alias — nothing more, declared identity can lie.
// Measured (reported by the agent once the build lands on the device): the honest identity from the
// artifact itself — an APK's package id and versionName. Measurement rides the registration
// heartbeat, so by the time the environment is allocatable the measured layer is there.
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
            data.measuredName ?? null,
            data.measuredVersion ?? null,
            ApplicationSource.fromObject(data.source),
        );
    }

    private constructor(
        private readonly _name: ApplicationName,
        private readonly _buildAlias: string | null,
        private _measuredName: string | null,
        private _measuredVersion: string | null,
        private readonly _source: ApplicationSource,
    ) {}

    get name(): string {
        return this._name.getValue();
    }

    get buildAlias(): string | null {
        return this._buildAlias;
    }

    get measuredName(): string | null {
        return this._measuredName;
    }

    get measuredVersion(): string | null {
        return this._measuredVersion;
    }

    get source(): ApplicationSource {
        return this._source;
    }

    answersToWord(word: string): boolean {
        return this.name === word || this._measuredName === word;
    }

    // A version ask matches by the picked build's alias, or exactly/segment-prefix against the
    // measured version.
    matchesVersionAsk(ask: string): boolean {
        if (this._buildAlias === ask) {
            return true;
        }

        return this._measuredVersion !== null && new ApplicationVersion(this._measuredVersion).matchesPrefix(ask);
    }

    // The agent's report from the device. Returns the mismatch verdict so the caller can fail the
    // environment: a dotted word is a reverse-DNS identity claim (android package ids — the catalog
    // declares them) and must equal the measured package id; a bare word claims nothing.
    applyMeasurement(measuredName: string | null, measuredVersion: string | null): boolean {
        this._measuredName = measuredName;
        this._measuredVersion = measuredVersion;

        if (this._source.isCustom()) {
            return true;
        }

        return !(this.claimsCanonicalName() && measuredName !== null && this.name !== measuredName);
    }

    // Identity is the word plus the picked build; the source refs are provenance.
    equals(other: Application): boolean {
        return this.name === other.name && this._buildAlias === other._buildAlias;
    }

    // Orders by the measured version, newest greater; an application not yet measured ranks below any
    // measured one, ties by nothing (stable sort keeps the load spread).
    compareVersion(other: Application): number {
        const mine = this._measuredVersion;
        const theirs = other._measuredVersion;

        if (mine === null || theirs === null) {
            return mine === theirs ? 0 : (mine === null ? -1 : 1);
        }

        return new ApplicationVersion(mine).compareTo(new ApplicationVersion(theirs));
    }

    private claimsCanonicalName(): boolean {
        return this.name.includes(".");
    }

    toObject(): ApplicationData {
        return {
            name: this.name,
            buildAlias: this._buildAlias,
            measuredName: this._measuredName,
            measuredVersion: this._measuredVersion,
            source: this._source.toObject(),
        };
    }
}
