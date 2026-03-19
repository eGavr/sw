import { User } from "./user";

describe("User", () => {
    describe("#from", () => {
        test("should return user from valid input", () => {
            const user = User.from("<valid>");

            expect(user?.id).toBe("valid");
        });

        test("should return 'null' in case of invalid input", () => {
            expect(User.from("invalid")).toBeNull();
            expect(User.from("<invalid")).toBeNull();
            expect(User.from("invalid>")).toBeNull();
        });
    });
});
