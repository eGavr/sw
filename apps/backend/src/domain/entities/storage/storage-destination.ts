import { InvalidArgumentError } from "../error/invalid-argument-error";

export type StorageDestinationCreateParams = {
    bucket: string;
    prefix?: string;
    endpoint?: string;
    region?: string;
};

export type StorageDestinationData = {
    bucket: string;
    prefix: string;
    endpoint?: string;
    region?: string;
};

// Where a user's session artifacts (logs, later video) are written: a bucket in their own
// S3-compatible storage plus an optional path prefix. Access is delegated — the user grants our service
// identity write access to this bucket via a bucket policy — so no credentials are held here or anywhere.
// Any concrete S3 endpoint (AWS, Yandex Object Storage) is addressed by the optional `endpoint`.
export class StorageDestination {
    static create(params: StorageDestinationCreateParams): StorageDestination {
        return new StorageDestination(
            StorageDestination.required(params.bucket, "bucket"),
            StorageDestination.trimSlashes(params.prefix ?? ""),
            params.endpoint,
            params.region,
        );
    }

    private static required(value: string, field: string): string {
        if (!value || value.trim().length === 0) {
            throw new InvalidArgumentError(`storage destination: ${field} is required`);
        }

        return value;
    }

    private static trimSlashes(value: string): string {
        return value.replace(/^\/+|\/+$/g, "");
    }

    private constructor(
        private readonly _bucket: string,
        private readonly _prefix: string,
        private readonly _endpoint?: string,
        private readonly _region?: string,
    ) {}

    get bucket(): string {
        return this._bucket;
    }

    get prefix(): string {
        return this._prefix;
    }

    get endpoint(): string | undefined {
        return this._endpoint;
    }

    get region(): string | undefined {
        return this._region;
    }

    // Full object key under this destination's prefix; internal path separators in `relativeKey`
    // are preserved, only surrounding slashes are collapsed so prefix and key join cleanly.
    keyFor(relativeKey: string): string {
        const key = [this._prefix, StorageDestination.trimSlashes(relativeKey)]
            .filter((segment) => segment.length > 0)
            .join("/");

        if (key.length === 0) {
            throw new InvalidArgumentError("storage destination: object key is empty");
        }

        return key;
    }

    toObject(): StorageDestinationData {
        return {
            bucket: this._bucket,
            prefix: this._prefix,
            endpoint: this._endpoint,
            region: this._region,
        };
    }
}
