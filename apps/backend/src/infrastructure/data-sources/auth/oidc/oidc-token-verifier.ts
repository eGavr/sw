import { JWTPayload, JWTVerifyGetKey, jwtVerify } from "jose";

export type VerifiedIdentity = {
    subject: string;
    groups: ReadonlyArray<string>;
};

export type OidcVerificationOptions = {
    issuer: string;
    audience: string;
    groupsClaim: string;
};

// The final client to the external identity provider: it verifies a signed OIDC JWT with `jose`. The
// signature is checked against the injected key set (a remote JWKS in production, a local one in tests),
// and the issuer, audience and expiry are validated by `jwtVerify`. On success it reads the subject and
// the configured groups claim; any verification failure throws, which the data source reads as "not
// authenticated".
export class OidcTokenVerifier {
    constructor(
        private readonly keys: JWTVerifyGetKey,
        private readonly options: OidcVerificationOptions,
    ) {}

    async verify(token: string): Promise<VerifiedIdentity> {
        const { payload } = await jwtVerify(token, this.keys, {
            issuer: this.options.issuer,
            audience: this.options.audience,
        });

        return {
            subject: payload.sub ?? "",
            groups: this.readGroups(payload[this.options.groupsClaim]),
        };
    }

    // The groups claim is asserted by the IdP and its shape is not guaranteed, so keep only string entries.
    private readGroups(claim: JWTPayload[string]): ReadonlyArray<string> {
        if (!Array.isArray(claim)) {
            return [];
        }

        return claim.filter((group): group is string => typeof group === "string" && group.length > 0);
    }
}
