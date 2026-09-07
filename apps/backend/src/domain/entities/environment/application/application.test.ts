import { InvalidArgumentError } from "../../error/invalid-argument-error";

import { Application } from "./application";
import { ApplicationList } from "./application-list";
import { ApplicationMatch } from "./application-match";
import { ApplicationSource } from "./application-source";

describe("Application", () => {
    describe(".create", () => {
        test("should throw when name contains invalid symbols", () => {
            expect(() => Application.create({ name: "Chrome!" })).toThrow(InvalidArgumentError);
        });

        test("accepts a canonical reverse-DNS name and a bare word alike", () => {
            expect(() => Application.create({ name: "com.android.chrome" })).not.toThrow();
            expect(() => Application.create({ name: "chrome", buildAlias: "152" })).not.toThrow();
        });

        test("rejects a malformed reverse-DNS name (empty segment)", () => {
            expect(() => Application.create({ name: "com..chrome" })).toThrow(InvalidArgumentError);
        });

        test("defaults the source to provided and carries no version — versions are measured", () => {
            const application = Application.create({ name: "chrome", buildAlias: "152" });

            expect(application.source.isCustom()).toBe(false);
            expect(application.measuredVersion).toBeNull();
        });
    });

    describe("custom source", () => {
        test("carries the build's artifact refs and survives a roundtrip", () => {
            const application = Application.create({
                name: "myapp",
                buildAlias: "7.1-rc2",
                source: ApplicationSource.custom({ appRef: "builds/app.apk", webdriverRef: "builds/driver" }),
            });

            const restored = Application.fromObject(application.toObject());

            expect(restored.source.isCustom()).toBe(true);
            expect(restored.source.appRef).toBe("builds/app.apk");
            expect(restored.source.webdriverRef).toBe("builds/driver");
            expect(restored.buildAlias).toBe("7.1-rc2");
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

    describe("measured identity", () => {
        test("measurement lands next to the word and becomes the only version there is", () => {
            const application = Application.create({ name: "myapp", buildAlias: "7.1-rc2" });

            application.applyMeasurement("com.mycorp.app", "7.1.3");

            expect(application.measuredVersion).toBe("7.1.3");
            expect(application.answersToWord("com.mycorp.app")).toBe(true);
            expect(application.answersToWord("myapp")).toBe(true);
            expect(application.matchesVersionAsk("7.1")).toBe(true);
            expect(application.matchesVersionAsk("7.1-rc2")).toBe(true);
        });

        test("no word is a claim — the measured identity is stored, never judged", () => {
            const application = Application.create({ name: "com.android.chrome", buildAlias: "152" });

            application.applyMeasurement("org.other.browser", "152.0.7977.80");

            expect(application.measuredName).toBe("org.other.browser");
            expect(application.answersToWord("com.android.chrome")).toBe(true);
            expect(application.answersToWord("org.other.browser")).toBe(true);
        });
    });

    describe("#equals", () => {
        test("identity is the word plus the picked build", () => {
            const first = Application.create({ name: "chrome", buildAlias: "152" });
            const same = Application.create({ name: "chrome", buildAlias: "152" });
            const other = Application.create({ name: "chrome", buildAlias: "151" });

            expect(first.equals(same)).toBe(true);
            expect(first.equals(other)).toBe(false);
        });
    });
});

describe("ApplicationList", () => {
    describe("#bestMatch", () => {
        const list = ApplicationList.fromObject([
            { name: "chrome", buildAlias: "151", measuredVersion: "151.0.7890.10" },
            { name: "chrome", buildAlias: "152", measuredVersion: "152.0.7977.82" },
            { name: "org.mozilla.firefox", buildAlias: "144", measuredVersion: "144.0.1" },
        ]);

        test("picks the newest measured version among the candidate words", () => {
            const match = ApplicationMatch.create({ names: ["chrome"], versionAsk: null });

            expect(list.bestMatch(match)?.measuredVersion).toBe("152.0.7977.82");
        });

        test("narrows by the version ask: alias or measured prefix", () => {
            expect(list.bestMatch(ApplicationMatch.create({ names: ["chrome"], versionAsk: "151" }))
                ?.measuredVersion).toBe("151.0.7890.10");
            expect(list.bestMatch(ApplicationMatch.create({ names: ["chrome"], versionAsk: "151.0.7890" }))
                ?.measuredVersion).toBe("151.0.7890.10");
        });

        test("returns null when nothing qualifies", () => {
            expect(list.bestMatch(ApplicationMatch.create({ names: ["chrome"], versionAsk: "150" }))).toBeNull();
        });
    });

    describe("#has", () => {
        const list = ApplicationList.fromObject([{ name: "chrome", buildAlias: "152" }]);

        test("should find an application by its identity (word + build)", () => {
            expect(list.has(Application.create({ name: "chrome", buildAlias: "152" }))).toBe(true);
            expect(list.has(Application.create({ name: "chrome", buildAlias: "151" }))).toBe(false);
        });
    });
});
