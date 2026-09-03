// Decides whether the tunnel client may open a connection to a target on the user's network. The exit is
// the user's own machine, so this is where egress policy belongs. Loopback IS allowed — reaching the
// user's localhost is the point — but link-local (169.254.0.0/16, fe80::/10, which covers cloud metadata
// at 169.254.169.254) is denied by default, so a remote browser cannot pivot to a CI runner's metadata
// service. An optional allowlist narrows further: when set, only its exact hosts are permitted.
export type EgressPolicyOptions = {
    allow?: ReadonlyArray<string>;
};

export class EgressPolicy {
    private readonly allow: ReadonlySet<string> | null;

    constructor(options: EgressPolicyOptions = {}) {
        this.allow = options.allow && options.allow.length > 0 ? new Set(options.allow) : null;
    }

    allows(host: string): boolean {
        if (isLinkLocal(host)) {
            return false;
        }

        if (this.allow) {
            return this.allow.has(host);
        }

        return true;
    }
}

function isLinkLocal(host: string): boolean {
    const normalized = host.toLowerCase();

    return normalized.startsWith("169.254.") || normalized.startsWith("fe80:");
}
