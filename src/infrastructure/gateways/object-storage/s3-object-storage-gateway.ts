import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Injectable } from "@nestjs/common";

import {
    ObjectStorageGateway,
    StoredObject,
    StoredStream,
} from "../../../application/interfaces/gateways/object-storage-gateway";
import { StorageDestination } from "../../../domain/entities/storage/storage-destination";

const defaultRegion = "us-east-1";

// Real adapter over any S3-compatible backend (AWS, Yandex Object Storage). Access is DELEGATED: we
// authenticate as our own service identity (the SDK's default credential provider chain — instance role
// / service-project token / env), and the user grants that identity write access to their bucket via a
// bucket policy. We never hold the user's credentials. `forcePathStyle` keeps non-AWS endpoints happy.
@Injectable()
export class S3ObjectStorageGateway extends ObjectStorageGateway {
    async put(destination: StorageDestination, key: string, object: StoredObject): Promise<void> {
        await this.clientFor(destination).send(new PutObjectCommand({
            Bucket: destination.bucket,
            Key: key,
            Body: object.body,
            ContentType: object.contentType,
        }));
    }

    // Streams an object of unknown size straight to storage as an S3 multipart upload — the SDK buffers
    // only one ~5 MB part at a time, so an arbitrarily large recording never sits whole in memory.
    async putStream(destination: StorageDestination, key: string, object: StoredStream): Promise<void> {
        await new Upload({
            client: this.clientFor(destination),
            params: {
                Bucket: destination.bucket,
                Key: key,
                Body: object.body,
                ContentType: object.contentType,
            },
        }).done();
    }

    async get(destination: StorageDestination, key: string): Promise<StoredObject | null> {
        try {
            const response = await this.clientFor(destination).send(
                new GetObjectCommand({ Bucket: destination.bucket, Key: key }),
            );

            if (!response.Body) {
                return null;
            }

            return { body: Buffer.from(await response.Body.transformToByteArray()), contentType: response.ContentType };
        } catch (error) {
            if (this.isNotFound(error)) {
                return null;
            }

            throw error;
        }
    }

    async list(destination: StorageDestination, prefix: string): Promise<Array<string>> {
        const response = await this.clientFor(destination).send(
            new ListObjectsV2Command({ Bucket: destination.bucket, Prefix: prefix }),
        );

        return (response.Contents ?? []).map((object) => object.Key).filter((key): key is string => key !== undefined);
    }

    private clientFor(destination: StorageDestination): S3Client {
        return new S3Client({
            endpoint: destination.endpoint,
            region: destination.region ?? defaultRegion,
            forcePathStyle: true,
        });
    }

    private isNotFound(error: unknown): boolean {
        return typeof error === "object" && error !== null && "name" in error
            && (error as { name?: string }).name === "NoSuchKey";
    }
}
