// Identity carried by a host agent's token — which pooled host it was issued for.
export type HostIdentity = {
    hostId: string;
};

// Mints and verifies the per-host credential the on-host agent presents when polling the internal API
// for its desired slots. Same model as the per-environment agent token (a leaked token compromises one
// machine until expiry, not the fleet), but a separate audience: a host token must never pass for an
// environment token or vice versa.
export abstract class HostTokenService {
    // Issue a token for the given host (embedded into the machine's boot metadata at ordering).
    abstract issue(hostId: string): Promise<string>;

    // Verify a presented token; resolves the host it belongs to or rejects (invalid signature,
    // issuer/audience, or expiry).
    abstract verify(token: string): Promise<HostIdentity>;
}
