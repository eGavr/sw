// Local (dev/test) identity, decoded straight from the bearer token: `<external-id>` or, to exercise
// IAM groups without a real IdP, `<external-id#group1,group2>`. A real OIDC data source would instead
// verify a signed JWT and read the subject and `groups` claim; the shape it returns is the same.
export class User {
    static from(token: string): User | null {
        const match = token.match(/<([^>]+)>/);

        if (!match) {
            return null;
        }

        const [externalId, groups] = match[1].split("#");

        if (externalId.length === 0) {
            return null;
        }

        return new User(externalId, groups ? groups.split(",").filter((group) => group.length > 0) : []);
    }

    readonly providerType = "local";

    private constructor(
        readonly id: string,
        readonly groups: ReadonlyArray<string>,
    ) {}
}
