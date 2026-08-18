type AuthorizationHeader = { authorization: string };

// Local auth (data-sources/auth/local): any `Bearer <external-id>` authenticates as that user, and
// `<external-id#group1,group2>` also asserts the caller's IAM groups (standing in for an IdP groups claim).
export class Authorization {
    static forUser(externalId: string, groups: ReadonlyArray<string> = []): AuthorizationHeader {
        const identity = groups.length > 0 ? `${externalId}#${groups.join(",")}` : externalId;

        return { authorization: `Bearer <${identity}>` };
    }

    static readonly invalidToken: AuthorizationHeader = { authorization: "Bearer invalid-token" };
}
