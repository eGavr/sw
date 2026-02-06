import { UnauthenticatedError } from "../error/unauthenticated-error";

type UserCredentialsInput = {
    token?: string;
}

export class UserCredentials {
    static create(input: UserCredentialsInput): UserCredentials {
        return new this(input);
    }

    private constructor(input: UserCredentialsInput) {
        this.assert(input);
    }

    private assert(input: UserCredentialsInput): void {
        if (!input.token) {
            throw new UnauthenticatedError();
        }
    }
}
