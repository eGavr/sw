import { UnauthenticatedError } from "../error/unauthenticated-error"

import { UserCredentials } from "./user-credentials";

describe("UserCredentials", () => {
    describe("#create", () => {
        test("should throw 'UnauthenticatedError' in case of no input", () => {
            const create = (): UserCredentials => UserCredentials.create({ token: undefined });

            expect(create).toThrow(UnauthenticatedError);
        });
    });
});
