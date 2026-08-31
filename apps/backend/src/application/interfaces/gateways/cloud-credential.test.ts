import { CloudCredential } from "./cloud-credential";

describe("CloudCredential", () => {
    const material = "yc-service-account-key-json-blob";

    test("reveals the raw material only through the explicit reveal()", () => {
        expect(CloudCredential.of(material).reveal()).toBe(material);
    });

    test("redacts the material from toString and template interpolation", () => {
        const credential = CloudCredential.of(material);

        expect(credential.toString()).toBe("[redacted cloud credential]");
        expect(`${credential}`).not.toContain(material);
    });

    test("redacts the material from JSON serialization", () => {
        const serialized = JSON.stringify({ credential: CloudCredential.of(material) });

        expect(serialized).not.toContain(material);
        expect(serialized).toContain("[redacted cloud credential]");
    });
});
