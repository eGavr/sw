import { StorageDestination } from "../../../domain/entities/storage/storage-destination";

export type StoredObject = {
    readonly body: Buffer;
    readonly contentType?: string;
};

// Driven port over the user's own object storage (any S3-compatible backend: AWS, Yandex Object
// Storage, MinIO). The destination — including its `credentialRef` — is resolved to a concrete client
// at the infrastructure boundary, so raw credentials never reach the domain. `get` exists so the local
// fake and read-back paths can retrieve what was written.
export abstract class ObjectStorageGateway {
    abstract put(destination: StorageDestination, key: string, object: StoredObject): Promise<void>;
    abstract get(destination: StorageDestination, key: string): Promise<StoredObject | null>;
    abstract list(destination: StorageDestination, prefix: string): Promise<Array<string>>;
}
