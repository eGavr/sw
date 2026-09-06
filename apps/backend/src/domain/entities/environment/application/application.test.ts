import { InvalidArgumentError } from "../../error/invalid-argument-error";
import { NonConcreteApplicationVersionError } from "../error/non-concrete-application-version-error";

import { Application } from "./application";
import { ApplicationList } from "./application-list";
import { ApplicationMatch } from "./application-match";
import { ApplicationSource } from "./application-source";

describe("Application", () => {
    describe(".create", () => {
        test("should throw when name contains invalid symbols", () => {
            const create = (): Application => Application.create({ name: "Chrome!", version: "100" });

            expect(create).toThrow(InvalidArgumentError);
        });

        test("should reject a non-concrete version (an installed application needs an exact version)", () => {
            const create = (): Application => Application.create({ name: "chrome", version: "latest" });

            expect(create).toThrow(NonConcreteApplicationVersionError);
        });

        test("should reject the non-concrete version regardless of case", () => {
            const create = (): Application => Application.create({ name: "chrome", version: "LATEST" });

            expect(create).toThrow(NonConcreteApplicationVersionError);
        });

        test("accepts a canonical reverse-DNS name", () => {
            expect(() => Application.create({ name: "com.android.chrome", version: "140.0.7339.80" })).not.toThrow();
        });

        test("rejects a malformed reverse-DNS name (empty segment)", () => {
            expect(() => Application.create({ name: "com..chrome", version: "1" })).toThrow(InvalidArgumentError);
        });

        test("defaults the source to provided", () => {
            expect(Application.create({ name: "chrome", version: "100" }).source.isCustom()).toBe(false);
        });
    });

    describe("custom source", () => {
        test("carries the build's artifact refs and survives a roundtrip", () => {
            const application = Application.create({
                name: "com.mycorp.app",
                version: "7.1.0",
                source: ApplicationSource.custom({ appRef: "builds/app.apk", webdriverRef: "builds/driver" }),
            });

            const restored = Application.fromObject(application.toObject());

            expect(restored.source.isCustom()).toBe(true);
            expect(restored.source.appRef).toBe("builds/app.apk");
            expect(restored.source.webdriverRef).toBe("builds/driver");
        });

        test("requires a non-empty appRef", () => {
            expect(() => ApplicationSource.custom({ appRef: "  " })).toThrow(InvalidArgumentError);
        });

        test("a provided source may carry the catalog build's refs", () => {
            const provided = ApplicationSource.provided({ appRef: "ref://chrome", webdriverRef: "ref://driver" });

            expect(provided.isCustom()).toBe(false);
            expect(provided.appRef).toBe("ref://chrome");
        });
    });

    describe(".fromObject", () => {
        test("should tolerate the reserved version (a request/stored value may carry it)", () => {
            const reconstitute = (): Application => Application.fromObject({ name: "chrome", version: "latest" });

            expect(reconstitute).not.toThrow();
        });
    });

    describe("#equals", () => {
        test("should treat same name and version as equal", () => {
            const chrome = Application.create({ name: "chrome", version: "100" });
            const sameChrome = Application.create({ name: "chrome", version: "100" });

            expect(chrome.equals(sameChrome)).toBe(true);
        });
    });
});

describe("ApplicationList", () => {
    describe("#bestMatch", () => {
        const list = ApplicationList.create({
            applications: [
                Application.create({ name: "com.google.chrome", version: "151.0.7890.10" }),
                Application.create({ name: "com.google.chrome", version: "152.0.7977.82" }),
                Application.create({ name: "org.mozilla.firefox", version: "144.0.1" }),
            ],
        });

        test("picks the newest application among the candidate names", () => {
            const match = ApplicationMatch.create({ names: ["chrome", "com.google.chrome"], versionPrefix: null });

            expect(list.bestMatch(match)?.version).toBe("152.0.7977.82");
        });

        test("narrows by the version prefix", () => {
            const match = ApplicationMatch.create({ names: ["com.google.chrome"], versionPrefix: "151" });

            expect(list.bestMatch(match)?.version).toBe("151.0.7890.10");
        });

        test("returns null when nothing qualifies", () => {
            const match = ApplicationMatch.create({ names: ["com.google.chrome"], versionPrefix: "150" });

            expect(list.bestMatch(match)).toBeNull();
        });
    });

    describe("#has", () => {
        const chrome100 = Application.create({ name: "chrome", version: "100" });
        const list = ApplicationList.create({ applications: [chrome100] });

        test("should find an application available in the list", () => {
            const requested = Application.create({ name: "chrome", version: "100" });

            expect(list.has(requested)).toBe(true);
        });

        test("should not find a different version", () => {
            const requested = Application.create({ name: "chrome", version: "101" });

            expect(list.has(requested)).toBe(false);
        });
    });
});
