import { InvalidArgumentError } from "../../error/invalid-argument-error";

export type ApplicationSourceData = {
    type: "provided" | "custom";
    appRef?: string;
    webdriverRef?: string;
};

type ArtifactRefs = {
    appRef?: string;
    webdriverRef?: string;
};

// Where an environment's application comes from, snapshotted at creation so the environment stays
// self-contained (later registry edits never touch a live environment): `provided` — the install
// catalog's build, refs into the install's own store (absent refs = preinstalled on the platform
// image); `custom` — the user's registered build, refs are object keys in the project's delegated
// bucket, with an optional paired webdriver.
export class ApplicationSource {
    static provided(refs: ArtifactRefs = {}): ApplicationSource {
        return new ApplicationSource("provided", refs.appRef ?? null, refs.webdriverRef ?? null);
    }

    static custom(refs: ArtifactRefs): ApplicationSource {
        if (!refs.appRef || refs.appRef.trim() === "") {
            throw new InvalidArgumentError("a custom application build requires an appRef");
        }

        return new ApplicationSource("custom", refs.appRef, refs.webdriverRef ?? null);
    }

    static fromObject(data?: ApplicationSourceData): ApplicationSource {
        if (!data || data.type === "provided") {
            return ApplicationSource.provided({ appRef: data?.appRef, webdriverRef: data?.webdriverRef });
        }

        return ApplicationSource.custom({ appRef: data.appRef ?? "", webdriverRef: data.webdriverRef });
    }

    private constructor(
        private readonly _type: "provided" | "custom",
        private readonly _appRef: string | null,
        private readonly _webdriverRef: string | null,
    ) {}

    isCustom(): boolean {
        return this._type === "custom";
    }

    get appRef(): string | null {
        return this._appRef;
    }

    get webdriverRef(): string | null {
        return this._webdriverRef;
    }

    toObject(): ApplicationSourceData {
        return {
            type: this._type,
            ...(this._appRef !== null ? { appRef: this._appRef } : {}),
            ...(this._webdriverRef !== null ? { webdriverRef: this._webdriverRef } : {}),
        };
    }
}
