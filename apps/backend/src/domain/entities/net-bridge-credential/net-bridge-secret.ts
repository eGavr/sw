import { createHash, randomBytes } from "node:crypto";

const secretPrefix = "swnb_";
const secretEntropyBytes = 32;

// The plaintext access key a caller presents to attach a NetBridge tunnel. Minted once and shown to the
// user a single time; only its fingerprint (sha256) is ever persisted, so a leak of our storage never
// yields a usable key. The `swnb_` prefix makes the secret recognisable to scanners (like GitHub's `ghp_`).
export class NetBridgeSecret {
    static generate(): NetBridgeSecret {
        return new NetBridgeSecret(`${secretPrefix}${randomBytes(secretEntropyBytes).toString("base64url")}`);
    }

    static fromString(value: string): NetBridgeSecret {
        return new NetBridgeSecret(value);
    }

    private constructor(private readonly value: string) {}

    getValue(): string {
        return this.value;
    }

    // The stored, non-secret fingerprint: matching a presented key means hashing it and comparing, so the
    // key itself never has to be kept. sha256 matches the fingerprinting used elsewhere for session keys.
    fingerprint(): string {
        return createHash("sha256").update(this.value).digest("hex");
    }
}
