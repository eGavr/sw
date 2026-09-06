import { Application } from "./application";

export type ApplicationMatchParams = {
    names: ReadonlyArray<string>;
    versionPrefix: string | null;
};

// A session request expanded into what may satisfy it: the candidate application names (the requested
// name itself plus every canonical id the catalog knows it as an alias of) and the requested version as
// a segment prefix (null = latest). Installed applications are canonical and full-versioned; the request
// stays loose — this object is the bridge between the two.
export class ApplicationMatch {
    static create(params: ApplicationMatchParams): ApplicationMatch {
        return new ApplicationMatch([...new Set(params.names)], params.versionPrefix);
    }

    private constructor(
        private readonly _names: ReadonlyArray<string>,
        private readonly _versionPrefix: string | null,
    ) {}

    get names(): ReadonlyArray<string> {
        return this._names;
    }

    get versionPrefix(): string | null {
        return this._versionPrefix;
    }

    isLatest(): boolean {
        return this._versionPrefix === null;
    }

    matches(application: Application): boolean {
        if (!this._names.includes(application.name)) {
            return false;
        }

        return this._versionPrefix === null || application.matchesVersionPrefix(this._versionPrefix);
    }
}
