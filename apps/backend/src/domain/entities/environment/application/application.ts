import { ApplicationName } from "./application-name";
import { ApplicationSource, ApplicationSourceData } from "./application-source";
import { ApplicationVersion } from "./application-version";

export type ApplicationData = {
    nameAlias: string;
    versionAlias?: string | null;
    name?: string | null;
    version?: string | null;
    source?: ApplicationSourceData;
};

export type ApplicationCreateParams = {
    nameAlias: string;
    versionAlias?: string;
    source?: ApplicationSource;
};

// An application installed on an environment, in two layers. The truth is what actually landed on the
// device — `name` and `version` are the honest identity the agent read off the artifact (an APK's
// package id and versionName), the real thing this environment runs. The aliases are how you address
// it: `nameAlias` is the word it was asked by (a catalog word, a canonical id, or a custom's own
// handle), `versionAlias` is the build label — either can stand in for name/version in a session
// request. Detection rides the registration heartbeat, so name/version are absent until then (and a
// linux app has no package id ever) — the aliases are always present, they are the operational keys.
export class Application {
    static create(params: ApplicationCreateParams): Application {
        return new Application(
            new ApplicationName(params.nameAlias),
            params.versionAlias ?? null,
            null,
            null,
            params.source ?? ApplicationSource.provided(),
        );
    }

    static fromObject(data: ApplicationData): Application {
        return new Application(
            new ApplicationName(data.nameAlias),
            data.versionAlias ?? null,
            data.name ?? null,
            data.version ?? null,
            ApplicationSource.fromObject(data.source),
        );
    }

    private constructor(
        private readonly _nameAlias: ApplicationName,
        private readonly _versionAlias: string | null,
        private _name: string | null,
        private _version: string | null,
        private readonly _source: ApplicationSource,
    ) {}

    // The word it was asked by — always present, the key sessions and allocation route on.
    get nameAlias(): string {
        return this._nameAlias.getValue();
    }

    // The picked build's label — a session may name a version by it.
    get versionAlias(): string | null {
        return this._versionAlias;
    }

    // The detected package id — the honest identity, absent until the agent reports it (and forever
    // for a platform with no package concept, like linux).
    get name(): string | null {
        return this._name;
    }

    // The detected version — the only real version there is, absent until the agent reports it.
    get version(): string | null {
        return this._version;
    }

    get source(): ApplicationSource {
        return this._source;
    }

    // Answers to either address: the word it was asked by or its detected identity.
    answersToWord(word: string): boolean {
        return this.nameAlias === word || this._name === word;
    }

    // A version ask matches the build label, or the detected version exactly / by segment prefix.
    matchesVersionAsk(ask: string): boolean {
        if (this._versionAlias === ask) {
            return true;
        }

        return this._version !== null && new ApplicationVersion(this._version).matchesPrefix(ask);
    }

    // The agent's report from the device: the honest identity lands beside the aliases. Nothing is
    // verified against them — an alias is an ADDRESS, not a claim; artifact integrity is the digest
    // check at delivery, not a name comparison.
    applyDetection(name: string | null, version: string | null): void {
        this._name = name;
        this._version = version;
    }

    // Identity is how it was addressed (word + picked build); the source refs are provenance.
    equals(other: Application): boolean {
        return this.nameAlias === other.nameAlias && this._versionAlias === other._versionAlias;
    }

    // Orders by the detected version, newest greater; an application not yet detected ranks below any
    // detected one, ties by nothing (stable sort keeps the load spread).
    compareVersion(other: Application): number {
        const mine = this._version;
        const theirs = other._version;

        if (mine === null || theirs === null) {
            return mine === theirs ? 0 : (mine === null ? -1 : 1);
        }

        return new ApplicationVersion(mine).compareTo(new ApplicationVersion(theirs));
    }

    toObject(): ApplicationData {
        return {
            nameAlias: this.nameAlias,
            versionAlias: this._versionAlias,
            name: this._name,
            version: this._version,
            source: this._source.toObject(),
        };
    }
}
