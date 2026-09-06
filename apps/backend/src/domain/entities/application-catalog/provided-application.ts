import { ApplicationName } from "../environment/application/application-name";
import { ApplicationVersion } from "../environment/application/application-version";
import { InvalidArgumentError } from "../error/invalid-argument-error";

export type ProvidedApplicationData = {
    platform: string;
    name: string;
    version: string;
    aliases?: Array<string>;
    // Where the delivery layer pulls the artifacts from (opaque refs — URLs or storage keys). Absent
    // means the application is preinstalled on the platform's base image: resolvable, nothing to deliver.
    artifacts?: {
        app: string;
        webdriver?: string;
    };
};

// One application the service itself can put onto an environment: a canonical reverse-DNS name, one
// honest FULL version, the wire aliases it answers to (`chrome`), and the artifacts to deliver.
export class ProvidedApplication {
    static fromObject(data: ProvidedApplicationData): ProvidedApplication {
        if (data.artifacts && data.artifacts.app.trim() === "") {
            throw new InvalidArgumentError(`application catalog: ${data.name}: empty app artifact`);
        }

        return new ProvidedApplication(
            data.platform,
            new ApplicationName(data.name),
            new ApplicationVersion(data.version),
            data.aliases ?? [],
            data.artifacts ?? null,
        );
    }

    private constructor(
        private readonly _platform: string,
        private readonly _name: ApplicationName,
        private readonly _version: ApplicationVersion,
        private readonly _aliases: ReadonlyArray<string>,
        private readonly _artifacts: { app: string; webdriver?: string } | null,
    ) {}

    get platform(): string {
        return this._platform;
    }

    get name(): string {
        return this._name.getValue();
    }

    get version(): string {
        return this._version.getValue();
    }

    get aliases(): ReadonlyArray<string> {
        return this._aliases;
    }

    // The vocabulary word the wire protocol knows this application by (`browserName: chrome`); a
    // catalog entry without aliases is addressed by its canonical name everywhere.
    wireName(): string {
        return this._aliases[0] ?? this.name;
    }

    appArtifact(): string | null {
        return this._artifacts?.app ?? null;
    }

    webdriverArtifact(): string | null {
        return this._artifacts?.webdriver ?? null;
    }

    answersTo(requestedName: string): boolean {
        return this.name === requestedName || this._aliases.includes(requestedName);
    }

    matchesVersion(requestedVersion: string | null): boolean {
        return requestedVersion === null || this._version.matchesPrefix(requestedVersion);
    }

    isNewerThan(other: ProvidedApplication): boolean {
        return this._version.compareTo(other._version) > 0;
    }

    toObject(): ProvidedApplicationData {
        return {
            platform: this._platform,
            name: this.name,
            version: this.version,
            ...(this._aliases.length > 0 ? { aliases: [...this._aliases] } : {}),
            ...(this._artifacts ? { artifacts: { ...this._artifacts } } : {}),
        };
    }
}
