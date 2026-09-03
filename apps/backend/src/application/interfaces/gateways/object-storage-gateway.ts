import { Readable } from "node:stream";

import { StorageDestination } from "../../../domain/entities/storage/storage-destination";
import { OwnershipMarker } from "../../../domain/entities/verification/ownership-marker";

export type StoredObject = {
    readonly body: Buffer;
    readonly contentType?: string;
};

export type StoredStream = {
    readonly body: Readable;
    readonly contentType?: string;
};

// Driven port over the user's own object storage (any S3-compatible backend: AWS, Yandex Object
// Storage, MinIO). The destination is resolved to a concrete client at the infrastructure boundary,
// authenticated as our own delegated identity, so no credentials reach the domain. `put` buffers a whole
// object (small artifacts like logs); `putStream` streams an arbitrarily large object (video) straight
// through without buffering it in memory. `get` exists so the local fake and read-back paths can retrieve
// what was written.
export abstract class ObjectStorageGateway {
    abstract put(destination: StorageDestination, key: string, object: StoredObject): Promise<void>;
    abstract putStream(destination: StorageDestination, key: string, object: StoredStream): Promise<void>;
    abstract get(destination: StorageDestination, key: string): Promise<StoredObject | null>;
    // Streams an object back (for large artifacts like video read-back) without buffering it whole.
    abstract getStream(destination: StorageDestination, key: string): Promise<StoredStream | null>;
    abstract list(destination: StorageDestination, prefix: string): Promise<Array<string>>;

    // Whether the bucket carries this project's ownership marker — proof the bucket's owner authorised
    // the project. The medium (a marker object at the bucket root) is this port's own concern, so callers
    // ask by project id and never build storage keys themselves. Read-only; we never write the marker.
    async verifyOwnership(destination: StorageDestination, projectId: string): Promise<boolean> {
        const marker = OwnershipMarker.forProject(projectId);

        return (await this.get(destination, marker.value())) !== null;
    }
}
