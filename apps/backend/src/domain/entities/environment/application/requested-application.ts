import { Application } from "./application";
import { ApplicationName } from "./application-name";
import { ApplicationVersion, latestApplicationVersion } from "./application-version";

export type RequestedApplicationParams = {
    name: string;
    version?: string;
};

// What a session or a create-environment asks for: an application by ONE word with a loose version ask
// (a build alias, a full version, a segment prefix) or "latest" — meaning "the newest offering it". An
// installed application answers by its word OR its detected identity; the ask stays loose. An omitted or
// "latest" version both mean latest.
export class RequestedApplication {
    static create(params: RequestedApplicationParams): RequestedApplication {
        const name = new ApplicationName(params.name);
        const version = params.version;

        if (version === undefined || version.toLowerCase() === latestApplicationVersion) {
            return new RequestedApplication(name, null);
        }

        return new RequestedApplication(name, new ApplicationVersion(version));
    }

    private constructor(
        private readonly _name: ApplicationName,
        private readonly _version: ApplicationVersion | null,
    ) {}

    get name(): string {
        return this._name.getValue();
    }

    isLatest(): boolean {
        return this._version === null;
    }

    // The version ask to match, or null when the newest should be picked.
    version(): string | null {
        return this._version?.getValue() ?? null;
    }

    matches(application: Application): boolean {
        if (!application.answersToWord(this.name)) {
            return false;
        }

        const ask = this.version();

        return ask === null || application.matchesVersionAsk(ask);
    }
}
