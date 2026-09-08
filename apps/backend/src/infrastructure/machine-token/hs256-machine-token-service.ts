import { jwtVerify, SignJWT } from "jose";

import { MachineIdentity, MachineTokenService } from "../../application/interfaces/machine-token-service";

const issuer = "sw-control-plane";

// Deliberately NOT the environment agent's audience: a machine token must never pass for an environment
// token or vice versa — the two guards verify different audiences with the same server-side key.
const audience = "sw-internal-machine";

// Per-machine token as a symmetric (HS256) signed JWT: `sub` is the machine's id. The machine agent is
// only a bearer; the key never leaves the control plane.
export class Hs256MachineTokenService extends MachineTokenService {
    constructor(
        private readonly key: Uint8Array,
        private readonly ttlSeconds: number,
    ) {
        super();
    }

    async issue(machineId: string): Promise<string> {
        return new SignJWT({})
            .setProtectedHeader({ alg: "HS256" })
            .setIssuer(issuer)
            .setAudience(audience)
            .setSubject(machineId)
            .setIssuedAt()
            .setExpirationTime(`${this.ttlSeconds}s`)
            .sign(this.key);
    }

    async verify(token: string): Promise<MachineIdentity> {
        const { payload } = await jwtVerify(token, this.key, { issuer, audience });

        if (!payload.sub) {
            throw new Error("machine token: missing subject");
        }

        return { machineId: payload.sub };
    }
}
