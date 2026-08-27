// Identity carried by an environment agent's token — which environment it was issued for.
export type AgentIdentity = {
    environmentId: string;
};

// Mints and verifies the per-environment credential the in-environment agent uses to call the internal
// API. The control plane both issues (at provision) and verifies (on each call) with a server-side signing
// key that never leaves it, so the agent only ever holds a derived token bound to its environment — not a
// shared secret. This replaces the single shared internal secret: a leaked token compromises one
// environment until it expires, not every agent.
export abstract class AgentTokenService {
    // Issue a token for the given environment (called by the compute adapter at provision).
    abstract issue(environmentId: string): Promise<string>;

    // Verify a presented token; resolves the environment it belongs to or rejects (invalid signature,
    // issuer/audience, or expiry).
    abstract verify(token: string): Promise<AgentIdentity>;
}
