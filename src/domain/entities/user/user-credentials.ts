type UserCredentialsCreateParams = {
    token: string;
}

export class UserCredentials {
    static create(input: UserCredentialsCreateParams): UserCredentials {
        return new this(input);
    }

    public readonly token: string;

    private constructor(input: UserCredentialsCreateParams) {
        this.token = input.token;
    }
}
