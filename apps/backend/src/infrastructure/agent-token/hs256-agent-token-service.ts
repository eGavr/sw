import { jwtVerify, SignJWT } from "jose";

import { AgentIdentity, AgentTokenService } from "../../application/interfaces/agent-token-service";

const issuer = "sw-control-plane";
const audience = "sw-internal";

// Per-environment agent token as a symmetric (HS256) signed JWT: `sub` is the environment id. The same
// server-side key both signs and verifies — the agent is only a bearer and never verifies, so a symmetric
// key is enough (no PKI/JWKS). The key never leaves the control plane.
export class Hs256AgentTokenService extends AgentTokenService {
    constructor(
        private readonly key: Uint8Array,
        private readonly ttlSeconds: number,
    ) {
        super();
    }

    async issue(environmentId: string): Promise<string> {
        return new SignJWT({})
            .setProtectedHeader({ alg: "HS256" })
            .setIssuer(issuer)
            .setAudience(audience)
            .setSubject(environmentId)
            .setIssuedAt()
            .setExpirationTime(`${this.ttlSeconds}s`)
            .sign(this.key);
    }

    async verify(token: string): Promise<AgentIdentity> {
        const { payload } = await jwtVerify(token, this.key, { issuer, audience });

        if (!payload.sub) {
            throw new Error("agent token: missing subject");
        }

        return { environmentId: payload.sub };
    }
}
