type AuthorizationHeader = { authorization: string };

// Local auth (data-sources/auth/local): any `Bearer <external-id>` authenticates as that user.
export class Authorization {
    static forUser(externalId: string): AuthorizationHeader {
        return { authorization: `Bearer <${externalId}>` };
    }

    static readonly invalidToken: AuthorizationHeader = { authorization: "Bearer invalid-token" };
}
