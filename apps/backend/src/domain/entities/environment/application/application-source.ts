import { InvalidArgumentError } from "../../error/invalid-argument-error";

export type ApplicationSourceData = {
    type: "provided" | "custom";
    appKey?: string;
    webdriverKey?: string;
};

// Where an environment's application comes from: `provided` — the service's own catalog delivers the
// artifacts (or the application is preinstalled on the platform image); `custom` — the user's build,
// pulled from the project's delegated storage bucket by object key, with an optional paired webdriver
// (a browser-like custom app needs one; a native app does not).
export class ApplicationSource {
    static provided(): ApplicationSource {
        return new ApplicationSource("provided", null, null);
    }

    static custom(params: { appKey: string; webdriverKey?: string }): ApplicationSource {
        if (!params.appKey || params.appKey.trim() === "") {
            throw new InvalidArgumentError("custom application source requires an appKey");
        }

        return new ApplicationSource("custom", params.appKey, params.webdriverKey ?? null);
    }

    static fromObject(data?: ApplicationSourceData): ApplicationSource {
        if (!data || data.type === "provided") {
            return ApplicationSource.provided();
        }

        return ApplicationSource.custom({ appKey: data.appKey ?? "", webdriverKey: data.webdriverKey });
    }

    private constructor(
        private readonly _type: "provided" | "custom",
        private readonly _appKey: string | null,
        private readonly _webdriverKey: string | null,
    ) {}

    isCustom(): boolean {
        return this._type === "custom";
    }

    get appKey(): string | null {
        return this._appKey;
    }

    get webdriverKey(): string | null {
        return this._webdriverKey;
    }

    toObject(): ApplicationSourceData {
        return {
            type: this._type,
            ...(this._appKey !== null ? { appKey: this._appKey } : {}),
            ...(this._webdriverKey !== null ? { webdriverKey: this._webdriverKey } : {}),
        };
    }
}
