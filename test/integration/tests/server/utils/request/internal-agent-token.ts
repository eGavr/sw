import { createHmac } from "node:crypto";

// Crafts a valid per-environment agent token (HS256), matching Hs256AgentTokenService, so integration
// tests can call the internal API as the agent of a specific environment. The signing key is the test
// INTERNAL_API_SECRET; `sub` is the environment id the guard enforces the request acts on.
export function internalAgentToken(environmentId: string, secret = "test-internal-secret"): string {
    const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString("base64url");

    const now = Math.floor(Date.now() / 1000);
    const header = encode({ alg: "HS256", typ: "JWT" });
    const payload = encode({
        iss: "sw-control-plane",
        aud: "sw-internal",
        sub: environmentId,
        iat: now,
        exp: now + 3600,
    });
    const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");

    return `${header}.${payload}.${signature}`;
}

export function internalAgentAuthHeader(environmentId: string): { authorization: string } {
    return { authorization: `Bearer ${internalAgentToken(environmentId)}` };
}
