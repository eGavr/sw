import { InvalidArgumentError } from "../error/invalid-argument-error";

import { StorageDestination } from "./storage-destination";

describe("StorageDestination", () => {
    const destination = (prefix?: string): StorageDestination =>
        StorageDestination.create({ bucket: "my-bucket", prefix });

    describe(".create", () => {
        test("should throw when bucket is empty", () => {
            const create = (): StorageDestination => StorageDestination.create({ bucket: "" });

            expect(create).toThrow(InvalidArgumentError);
        });
    });

    describe("#keyFor", () => {
        test("should join a normalized prefix with the relative key", () => {
            expect(destination("logs/").keyFor("sessions/abc/session.log")).toBe("logs/sessions/abc/session.log");
        });

        test("should collapse surrounding slashes on both sides", () => {
            expect(destination("/logs//").keyFor("/sessions/abc/")).toBe("logs/sessions/abc");
        });

        test("should work without a prefix", () => {
            expect(destination().keyFor("sessions/abc/session.log")).toBe("sessions/abc/session.log");
        });

        test("should throw when the resulting key is empty", () => {
            expect(() => destination().keyFor("")).toThrow(InvalidArgumentError);
        });
    });
});
