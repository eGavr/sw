import { SuperUser } from "./super-user";

describe("SuperUser", () => {
    describe("#isSuperUser", () => {
        test("should return 'true' for super user", () => {
            expect(SuperUser.isSuperUser(SuperUser.id)).toBe(true);
        });

        test("should return 'false' for non-super user", () => {
            expect(SuperUser.isSuperUser("some-user")).toBe(false);
        });
    });
});
