import { Application } from "../environment/application/application";
import { EnvironmentId } from "../environment/environment-id";

import { Session } from "./session";
import { SessionIdleTimeout } from "./session-idle-timeout";

describe("Session", () => {
    const createSession = (now: Date): Session =>
        Session.create({
            environmentId: EnvironmentId.create(),
            application: Application.create({ name: "chrome", version: "100" }),
            idleTimeout: SessionIdleTimeout.fromMilliseconds(30_000),
            now,
        });

    describe("#isIdleAt", () => {
        test("should not be idle within the timeout window", () => {
            const session = createSession(new Date(0));

            expect(session.isIdleAt(new Date(30_000))).toBe(false);
        });

        test("should be idle after the timeout window without activity", () => {
            const session = createSession(new Date(0));

            expect(session.isIdleAt(new Date(30_001))).toBe(true);
        });
    });

    describe("#touch", () => {
        test("should keep the session alive while requests keep coming", () => {
            const session = createSession(new Date(0));

            session.touch(new Date(20_000));

            expect(session.isIdleAt(new Date(45_000))).toBe(false);
        });
    });
});
