import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import {
    ObjectStorageGateway,
    StoredObject,
    StoredStream,
} from "../../../application/interfaces/gateways/object-storage-gateway";
import { StorageDestination } from "../../../domain/entities/storage/storage-destination";

// The content type travels as a sidecar file next to the object — the filesystem has no metadata slot.
const contentTypeSuffix = ".content-type";

// Local-disk object storage for development: objects live as plain files under `<root>/<bucket>/<key>`,
// so every process of the install (api, wd, internal) reads what any other wrote — unlike the
// in-memory fake, whose map dies with its process. Selected per install via LOG_STORAGE=fs.
export class FsObjectStorageGateway extends ObjectStorageGateway {
    constructor(private readonly root: string) {
        super();
    }

    async put(destination: StorageDestination, key: string, object: StoredObject): Promise<void> {
        const file = await this.prepare(destination, key);

        await writeFile(file, object.body);
        await this.writeContentType(file, object.contentType);
    }

    async putStream(destination: StorageDestination, key: string, object: StoredStream): Promise<void> {
        const file = await this.prepare(destination, key);

        await pipeline(object.body, createWriteStream(file));
        await this.writeContentType(file, object.contentType);
    }

    async get(destination: StorageDestination, key: string): Promise<StoredObject | null> {
        const file = this.locate(destination, key);

        try {
            return { body: await readFile(file), contentType: await this.readContentType(file) };
        } catch (error) {
            return this.nullOnMissing(error);
        }
    }

    async getStream(destination: StorageDestination, key: string): Promise<StoredStream | null> {
        const file = this.locate(destination, key);

        try {
            await stat(file);

            return { body: createReadStream(file), contentType: await this.readContentType(file) };
        } catch (error) {
            return this.nullOnMissing(error);
        }
    }

    async list(destination: StorageDestination, prefix: string): Promise<Array<string>> {
        const scope = path.resolve(this.root, destination.bucket);

        try {
            return (await this.walk(scope))
                .map((file) => path.relative(scope, file).split(path.sep).join("/"))
                .filter((key) => key.startsWith(prefix) && !key.endsWith(contentTypeSuffix));
        } catch (error) {
            const empty = this.nullOnMissing(error);

            return empty === null ? [] : empty;
        }
    }

    // Keys are generated internally (artifact fingerprints), but a path check costs nothing: nothing
    // addressed under a bucket may resolve outside of it.
    private locate(destination: StorageDestination, key: string): string {
        const scope = path.resolve(this.root, destination.bucket);
        const target = path.resolve(scope, key);

        if (!target.startsWith(scope + path.sep)) {
            throw new Error(`object storage: key escapes its bucket: ${key}`);
        }

        return target;
    }

    private async prepare(destination: StorageDestination, key: string): Promise<string> {
        const file = this.locate(destination, key);

        await mkdir(path.dirname(file), { recursive: true });

        return file;
    }

    private async writeContentType(file: string, contentType: string | undefined): Promise<void> {
        if (contentType) {
            await writeFile(file + contentTypeSuffix, contentType);
        }
    }

    private async readContentType(file: string): Promise<string | undefined> {
        try {
            return await readFile(file + contentTypeSuffix, "utf8");
        } catch {
            return undefined;
        }
    }

    private async walk(directory: string): Promise<Array<string>> {
        const entries = await readdir(directory, { withFileTypes: true });
        const files = await Promise.all(entries.map((entry) => {
            const entryPath = path.join(directory, entry.name);

            return entry.isDirectory() ? this.walk(entryPath) : Promise.resolve([entryPath]);
        }));

        return files.flat();
    }

    private nullOnMissing(error: unknown): null {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return null;
        }

        throw error;
    }
}
