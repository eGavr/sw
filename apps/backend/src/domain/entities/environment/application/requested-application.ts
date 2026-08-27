import { ApplicationName } from "./application-name";
import { ApplicationVersion, latestApplicationVersion } from "./application-version";

export type RequestedApplicationParams = {
    name: string;
    version?: string;
};

// What a session asks for: an application by name with either an exact version or "latest" — meaning "the
// newest running environment offering it". Unlike an environment's installed Application (always concrete),
// the version may be unspecified; an omitted or "latest" version both mean latest.
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

    // The exact version to match, or null when the newest should be picked.
    version(): string | null {
        return this._version?.getValue() ?? null;
    }
}
