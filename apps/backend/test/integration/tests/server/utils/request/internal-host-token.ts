import { createHmac } from "node:crypto";

// Crafts a valid per-host token (HS256), matching Hs256HostTokenService, so integration tests can call
// the internal API as the agent of a specific pooled host. Note the host-specific audience — an
// environment agent token must never pass on host routes, and this util mints only host-audience ones.
export function internalHostToken(hostId: string, secret = "test-internal-secret"): string {
    const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString("base64url");

    const now = Math.floor(Date.now() / 1000);
    const header = encode({ alg: "HS256", typ: "JWT" });
    const payload = encode({
        iss: "sw-control-plane",
        aud: "sw-internal-host",
        sub: hostId,
        iat: now,
        exp: now + 3600,
    });
    const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");

    return `${header}.${payload}.${signature}`;
}
