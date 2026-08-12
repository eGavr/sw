import { SessionVideoKey } from "./session-video-key";

describe("SessionVideoKey", () => {
    const environmentId = "3b8ce88a-9b59-4bee-8e60-0e55997dd58c";
    const endedAt = new Date("2026-08-12T01:23:45.678Z");

    describe(".forEnvironment", () => {
        test("builds the key from the environment id and a colon-free timestamp", () => {
            expect(SessionVideoKey.forEnvironment(environmentId, endedAt))
                .toBe(`sessions/${environmentId}/20260812T012345.678Z/session.mp4`);
        });

        test("never contains a colon so it is safe as an object key", () => {
            expect(SessionVideoKey.forEnvironment(environmentId, endedAt)).not.toContain(":");
        });
    });
});
