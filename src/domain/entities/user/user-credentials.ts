type CreateUserCredentialsParams = {
    token: string;
}

export class UserCredentials {
    static create(input: CreateUserCredentialsParams): UserCredentials {
        return new this(input);
    }

    public readonly token: string;

    private constructor(input: CreateUserCredentialsParams) {
        this.token = input.token;
    }
}
