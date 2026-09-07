import { NonConcreteApplicationVersionError } from "../error/non-concrete-application-version-error";

import { ApplicationName } from "./application-name";
import { ApplicationSource, ApplicationSourceData } from "./application-source";
import { ApplicationVersion, latestApplicationVersion } from "./application-version";

export type ApplicationData = {
    name: string;
    version?: string | null;
    buildAlias?: string | null;
    measuredName?: string | null;
    measuredVersion?: string | null;
    source?: ApplicationSourceData;
};

export type ApplicationCreateParams = {
    name: string;
    version?: string;
    buildAlias?: string;
    source?: ApplicationSource;
};

// An application installed on an environment, in two layers. Declared (snapshotted at creation): the
// WORD it was asked by, the picked build's alias, and — for a catalog build — the exact version its
// trusted source declared; a custom declares no version at all. Measured (reported by the agent once
// the build lands on the device): the honest identity from the artifact itself — an APK's package id
// and versionName. The truth is the measured layer; the declared layer is addressing, and for the
// catalog a claim the measurement cross-checks.
export class Application {
    static create(params: ApplicationCreateParams): Application {
        if (params.version !== undefined && params.version.toLowerCase() === latestApplicationVersion) {
            throw new NonConcreteApplicationVersionError(params.version);
        }

        return new Application(
            new ApplicationName(params.name),
            params.version ?? null,
            params.buildAlias ?? null,
            null,
            null,
            params.source ?? ApplicationSource.provided(),
        );
    }

    static fromObject(data: ApplicationData): Application {
        return new Application(
            new ApplicationName(data.name),
            data.version ?? null,
            data.buildAlias ?? null,
            data.measuredName ?? null,
            data.measuredVersion ?? null,
            ApplicationSource.fromObject(data.source),
        );
    }

    private constructor(
        private readonly _name: ApplicationName,
        private readonly _version: string | null,
        private readonly _buildAlias: string | null,
        private _measuredName: string | null,
        private _measuredVersion: string | null,
        private readonly _source: ApplicationSource,
    ) {}

    get name(): string {
        return this._name.getValue();
    }

    // The declared exact version (a catalog build's claim); a custom has none until measured.
    get version(): string | null {
        return this._version;
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

    // The honest version when known, else the declared claim, else nothing yet.
    effectiveVersion(): string | null {
        return this._measuredVersion ?? this._version;
    }

    answersToWord(word: string): boolean {
        return this.name === word || this._measuredName === word;
    }

    // A version ask matches by the picked build's alias, or exactly/segment-prefix against the
    // effective (measured-first) version.
    matchesVersionAsk(ask: string): boolean {
        if (this._buildAlias === ask) {
            return true;
        }

        const effective = this.effectiveVersion();

        return effective !== null && new ApplicationVersion(effective).matchesPrefix(ask);
    }

    // The agent's report from the device. Returns the mismatch verdict so the caller can fail the
    // environment: a catalog build's declared claims must survive measurement — a declared version
    // must equal the measured one, and a reverse-DNS name claim must equal the measured package id.
    applyMeasurement(measuredName: string | null, measuredVersion: string | null): boolean {
        this._measuredName = measuredName;
        this._measuredVersion = measuredVersion;

        if (this._source.isCustom()) {
            return true;
        }

        if (this._version !== null && measuredVersion !== null && this._version !== measuredVersion) {
            return false;
        }

        return !(this.claimsCanonicalName() && measuredName !== null && this.name !== measuredName);
    }

    // Identity is the word plus the picked build; the source refs are provenance.
    equals(other: Application): boolean {
        return this.name === other.name
            && this._version === other._version
            && this._buildAlias === other._buildAlias;
    }

    // Orders by the effective (measured-first) version, newest greater; an application with no known
    // version yet ranks below any with one.
    compareVersion(other: Application): number {
        const mine = this.effectiveVersion();
        const theirs = other.effectiveVersion();

        if (mine === null || theirs === null) {
            return mine === theirs ? 0 : (mine === null ? -1 : 1);
        }

        return new ApplicationVersion(mine).compareTo(new ApplicationVersion(theirs));
    }

    // A dotted word is a reverse-DNS identity claim (android package ids); a bare word (`chrome`)
    // claims nothing beyond being an address.
    private claimsCanonicalName(): boolean {
        return this.name.includes(".");
    }

    toObject(): ApplicationData {
        return {
            name: this.name,
            version: this._version,
            buildAlias: this._buildAlias,
            measuredName: this._measuredName,
            measuredVersion: this._measuredVersion,
            source: this._source.toObject(),
        };
    }
}
