import { randomUUID } from "node:crypto";

import { SecretStore } from "../../../application/interfaces/gateways/secret-store";

// In-process secret store for tests: the map dies with the process, so it never fits a multi-process
// install (connect in api, resolve in worker) — that is what the fs and Lockbox backends are for.
export class InMemorySecretStore extends SecretStore {
    private readonly secrets = new Map<string, string>();

    async store(material: string): Promise<string> {
        const reference = randomUUID();

        this.secrets.set(reference, material);

        return reference;
    }

    async resolve(reference: string): Promise<string | null> {
        return this.secrets.get(reference) ?? null;
    }

    async delete(reference: string): Promise<void> {
        this.secrets.delete(reference);
    }
}
