import { ProjectId } from "../project/project-id";

import { NetBridgeCredential } from "./net-bridge-credential";
import { NetBridgeSecret } from "./net-bridge-secret";

const projectId = ProjectId.create();

describe("NetBridgeCredential", () => {
    test("stores only the secret's fingerprint, never the plaintext", () => {
        const secret = NetBridgeSecret.generate();
        const credential = NetBridgeCredential.create({ projectId, secret });

        const serialized = JSON.stringify(credential.toObject());
        expect(serialized).not.toContain(secret.getValue());
        expect(credential.toObject().secretHash).toBe(secret.fingerprint());
    });

    test("never expires when no expiry is set", () => {
        const credential = NetBridgeCredential.create({ projectId, secret: NetBridgeSecret.generate() });

        expect(credential.isExpired(new Date())).toBe(false);
    });

    test("is expired once the clock reaches the expiry", () => {
        const expiresAt = new Date("2026-01-01T00:00:00.000Z");
        const credential = NetBridgeCredential.create({ projectId, secret: NetBridgeSecret.generate(), expiresAt });

        expect(credential.isExpired(new Date("2025-12-31T23:59:59.000Z"))).toBe(false);
        expect(credential.isExpired(expiresAt)).toBe(true);
        expect(credential.isExpired(new Date("2026-01-02T00:00:00.000Z"))).toBe(true);
    });

    test("records the last time it was used", () => {
        const credential = NetBridgeCredential.create({ projectId, secret: NetBridgeSecret.generate() });
        const usedAt = new Date("2026-05-05T05:05:05.000Z");

        credential.recordUse(usedAt);

        expect(credential.lastUsedAt).toBe(usedAt);
    });
});
