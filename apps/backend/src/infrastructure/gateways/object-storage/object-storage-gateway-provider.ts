import { ConfigService } from "@nestjs/config";

import { ObjectStorageGateway } from "../../../application/interfaces/gateways/object-storage-gateway";

import { FsObjectStorageGateway } from "./fs-object-storage-gateway";
import { InMemoryObjectStorageGateway } from "./in-memory-object-storage-gateway";
import { S3ObjectStorageGateway } from "./s3-object-storage-gateway";

const defaultFsRoot = ".dev-storage";

// Selects the object-storage backend per install (LOG_STORAGE): `s3` for any real S3-compatible
// endpoint (accessed via our delegated service identity), `fs` for local development (plain files
// under LOG_STORAGE_FS_ROOT — shared by all processes of the install, unlike `memory`), `memory`
// (default) for the in-process fake used in tests.
export const ObjectStorageGatewayProvider = {
    provide: ObjectStorageGateway,
    useFactory: (configService: ConfigService): ObjectStorageGateway => {
        switch (configService.get<string>("LOG_STORAGE")) {
            case "s3":
                return new S3ObjectStorageGateway();
            case "fs":
                return new FsObjectStorageGateway(configService.get<string>("LOG_STORAGE_FS_ROOT") ?? defaultFsRoot);
            default:
                return new InMemoryObjectStorageGateway();
        }
    },
    inject: [ConfigService],
};
