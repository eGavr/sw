import { FindUserQuery } from "../../../../application/interfaces/repositories/user-repository";
import { User, UserDataSource } from "../user-data-source";

import { OidcTokenVerifier } from "./oidc-token-verifier";

const providerType = "oidc";

// Authenticates a caller by their OIDC bearer token: a JWT issued by the external identity provider. The
// subject becomes the external id and the groups claim becomes the caller's IdP groups, mirroring the
// shape the local stub returns. Persistence is untouched — the row (if any) is joined in the repository.
export class OidcUserDataSource extends UserDataSource {
    constructor(private readonly verifier: OidcTokenVerifier) {
        super();
    }

    async findOne(query: FindUserQuery): Promise<User | null> {
        try {
            const identity = await this.verifier.verify(query.filter.creds.token);

            if (identity.subject.length === 0) {
                return null;
            }

            return { id: identity.subject, providerType, groups: identity.groups };
        } catch {
            // A malformed, expired, wrong-issuer/audience or badly-signed token — and an unreachable JWKS —
            // all mean the same thing here: we could not authenticate this caller. Fail closed.
            return null;
        }
    }
}
