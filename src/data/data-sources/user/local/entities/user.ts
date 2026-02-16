export class User {
    static from(token: string): User | null {
        const match = token.match(/<([^>]+)>/);

        if (!match) {
            return null
        }

        return new User(match[1]);
    }

    private constructor(readonly id: string) {}
}
