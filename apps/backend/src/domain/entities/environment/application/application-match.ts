import { Application } from "./application";

export type ApplicationMatchParams = {
    names: ReadonlyArray<string>;
    versionAsk: string | null;
};

// A session request expanded into what may satisfy it: the candidate words (the requested name itself
// plus every canonical id the catalog knows it as an alias of) and the version ask (a build alias, a
// full version or a segment prefix; null = latest). An installed application answers by its declared
// word OR its measured identity; the request stays loose — this object is the bridge between the two.
export class ApplicationMatch {
    static create(params: ApplicationMatchParams): ApplicationMatch {
        return new ApplicationMatch([...new Set(params.names)], params.versionAsk);
    }

    private constructor(
        private readonly _names: ReadonlyArray<string>,
        private readonly _versionAsk: string | null,
    ) {}

    get names(): ReadonlyArray<string> {
        return this._names;
    }

    get versionAsk(): string | null {
        return this._versionAsk;
    }

    isLatest(): boolean {
        return this._versionAsk === null;
    }

    matches(application: Application): boolean {
        if (!this._names.some((name) => application.answersToWord(name))) {
            return false;
        }

        return this._versionAsk === null || application.matchesVersionAsk(this._versionAsk);
    }
}
