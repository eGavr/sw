import { jwtVerify, SignJWT } from "jose";

import { HostIdentity, HostTokenService } from "../../application/interfaces/host-token-service";

const issuer = "sw-control-plane";

// Deliberately NOT the agent-token audience: a host token must never pass for an environment token or
// vice versa — the two guards verify different audiences with the same server-side key.
const audience = "sw-internal-host";

// Per-host token as a symmetric (HS256) signed JWT: `sub` is the pooled host's id. Same model as the
// per-environment agent token — the host agent is only a bearer, the key never leaves the control plane.
export class Hs256HostTokenService extends HostTokenService {
    constructor(
        private readonly key: Uint8Array,
        private readonly ttlSeconds: number,
    ) {
        super();
    }

    async issue(hostId: string): Promise<string> {
        return new SignJWT({})
            .setProtectedHeader({ alg: "HS256" })
            .setIssuer(issuer)
            .setAudience(audience)
            .setSubject(hostId)
            .setIssuedAt()
            .setExpirationTime(`${this.ttlSeconds}s`)
            .sign(this.key);
    }

    async verify(token: string): Promise<HostIdentity> {
        const { payload } = await jwtVerify(token, this.key, { issuer, audience });

        if (!payload.sub) {
            throw new Error("host token: missing subject");
        }

        return { hostId: payload.sub };
    }
}
