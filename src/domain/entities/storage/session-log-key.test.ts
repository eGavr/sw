import { SessionLogKey } from "./session-log-key";

describe("SessionLogKey", () => {
    const environmentId = "3b8ce88a-9b59-4bee-8e60-0e55997dd58c";
    const endedAt = new Date("2026-08-12T01:23:45.678Z");

    describe(".forEnvironment", () => {
        test("builds the key from the environment id and a colon-free timestamp", () => {
            expect(SessionLogKey.forEnvironment(environmentId, endedAt))
                .toBe(`sessions/${environmentId}/20260812T012345.678Z/session.log`);
        });

        test("never contains a colon so it is safe as an object key", () => {
            expect(SessionLogKey.forEnvironment(environmentId, endedAt)).not.toContain(":");
        });
    });
});
