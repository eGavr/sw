import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { SecretStore } from "../../../application/interfaces/gateways/secret-store";

// Local-disk secret store for development: each secret is a file `<root>/<reference>`, so every process of
// the install (api writes on connect, worker reads on provision) sees what the other stored — unlike the
// in-memory fake, whose map dies with its process. NOT for production (plaintext on disk): prod uses the
// Lockbox backend. The reference is an opaque uuid, so it doubles as a filename that cannot escape the root.
export class FsSecretStore extends SecretStore {
    constructor(private readonly root: string) {
        super();
    }

    async store(material: string): Promise<string> {
        const reference = randomUUID();

        await mkdir(this.root, { recursive: true });
        await writeFile(this.locate(reference), material);

        return reference;
    }

    async resolve(reference: string): Promise<string | null> {
        try {
            return await readFile(this.locate(reference), "utf8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return null;
            }

            throw error;
        }
    }

    async delete(reference: string): Promise<void> {
        await rm(this.locate(reference), { force: true });
    }

    private locate(reference: string): string {
        const file = path.resolve(this.root, reference);

        if (path.dirname(file) !== path.resolve(this.root)) {
            throw new Error(`secret store: reference escapes its root: ${reference}`);
        }

        return file;
    }
}
