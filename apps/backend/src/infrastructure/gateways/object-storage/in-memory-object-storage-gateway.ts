import { Readable } from "node:stream";

import { Injectable } from "@nestjs/common";

import {
    ObjectStorageGateway,
    StoredObject,
    StoredStream,
} from "../../../application/interfaces/gateways/object-storage-gateway";
import { StorageDestination } from "../../../domain/entities/storage/storage-destination";

// Separates the bucket from the object key in the map key. An S3 bucket name cannot contain a space, so
// the first space always delimits the bucket; prefixing every lookup with `bucket + separator` keeps
// `startsWith`/`slice` correct even when object keys themselves contain spaces.
const bucketKeySeparator = " ";

// In-process fake object storage for local development and tests: writes are kept in memory keyed by
// bucket + object key and can be read back. Endpoint/region/credentials are ignored — fidelity to a
// real S3 endpoint is the S3 adapter's job. Selected per install via LOG_STORAGE=memory.
@Injectable()
export class InMemoryObjectStorageGateway extends ObjectStorageGateway {
    private readonly objects = new Map<string, StoredObject>();

    put(destination: StorageDestination, key: string, object: StoredObject): Promise<void> {
        this.objects.set(this.locate(destination, key), object);

        return Promise.resolve();
    }

    async putStream(destination: StorageDestination, key: string, object: StoredStream): Promise<void> {
        const chunks: Array<Buffer> = [];

        for await (const chunk of object.body) {
            chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk as Uint8Array));
        }

        this.objects.set(this.locate(destination, key), { body: Buffer.concat(chunks), contentType: object.contentType });
    }

    get(destination: StorageDestination, key: string): Promise<StoredObject | null> {
        return Promise.resolve(this.objects.get(this.locate(destination, key)) ?? null);
    }

    getStream(destination: StorageDestination, key: string): Promise<StoredStream | null> {
        const object = this.objects.get(this.locate(destination, key));

        return Promise.resolve(object ? { body: Readable.from(object.body), contentType: object.contentType } : null);
    }

    list(destination: StorageDestination, prefix: string): Promise<Array<string>> {
        const scope = `${destination.bucket}${bucketKeySeparator}`;

        const keys = [...this.objects.keys()]
            .filter((location) => location.startsWith(scope + prefix))
            .map((location) => location.slice(scope.length));

        return Promise.resolve(keys);
    }

    private locate(destination: StorageDestination, key: string): string {
        return `${destination.bucket}${bucketKeySeparator}${key}`;
    }
}
