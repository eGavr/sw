import { ConfigService } from "@nestjs/config";

import { ObjectStorageGateway } from "../../../application/interfaces/gateways/object-storage-gateway";

import { InMemoryObjectStorageGateway } from "./in-memory-object-storage-gateway";
import { S3ObjectStorageGateway } from "./s3-object-storage-gateway";

// Selects the object-storage backend per install (LOG_STORAGE): `s3` for any real S3-compatible
// endpoint (accessed via our delegated service identity), `memory` (default) for the in-process fake
// used in local dev and tests.
export const ObjectStorageGatewayProvider = {
    provide: ObjectStorageGateway,
    useFactory: (configService: ConfigService): ObjectStorageGateway => {
        if (configService.get<string>("LOG_STORAGE") === "s3") {
            return new S3ObjectStorageGateway();
        }

        return new InMemoryObjectStorageGateway();
    },
    inject: [ConfigService],
};
