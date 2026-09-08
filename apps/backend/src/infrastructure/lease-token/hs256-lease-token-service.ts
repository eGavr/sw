import { jwtVerify, SignJWT } from "jose";

import { LeaseIdentity, LeaseTokenService } from "../../application/interfaces/lease-token-service";

const issuer = "sw-control-plane";

// Deliberately NOT the agent-token audience: a host token must never pass for an environment token or
// vice versa — the two guards verify different audiences with the same server-side key.
const audience = "sw-internal-host";

// Per-host token as a symmetric (HS256) signed JWT: `sub` is the pooled host's id. Same model as the
// per-environment agent token — the host agent is only a bearer, the key never leaves the control plane.
export class Hs256LeaseTokenService extends LeaseTokenService {
    constructor(
        private readonly key: Uint8Array,
        private readonly ttlSeconds: number,
    ) {
        super();
    }

    async issue(leaseId: string): Promise<string> {
        return new SignJWT({})
            .setProtectedHeader({ alg: "HS256" })
            .setIssuer(issuer)
            .setAudience(audience)
            .setSubject(leaseId)
            .setIssuedAt()
            .setExpirationTime(`${this.ttlSeconds}s`)
            .sign(this.key);
    }

    async verify(token: string): Promise<LeaseIdentity> {
        const { payload } = await jwtVerify(token, this.key, { issuer, audience });

        if (!payload.sub) {
            throw new Error("lease token: missing subject");
        }

        return { leaseId: payload.sub };
    }
}
