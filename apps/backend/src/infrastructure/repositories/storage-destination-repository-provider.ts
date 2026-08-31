import { ConfigService } from "@nestjs/config";

import {
    StorageDestinationRepository,
} from "../../application/interfaces/repositories/storage-destination-repository";
import {
    StorageDestinationDataSource,
} from "../data-sources/database/postgres/storage-destination-data-source";

import { StorageDestinationRepositoryImpl } from "./storage-destination-repository-impl";
import { StorageDestinationRepositoryWithDefault } from "./storage-destination-repository-with-default";

// A local-disk install (LOG_STORAGE=fs) can always take artifacts, so it defaults every project's
// destination — uploads and read-back just work in development. Real installs keep the honest rule:
// no destination configured, no artifacts stored.
export const StorageDestinationRepositoryProvider = {
    provide: StorageDestinationRepository,
    useFactory: (
        dataSource: StorageDestinationDataSource,
        configService: ConfigService,
    ): StorageDestinationRepository => {
        const base = new StorageDestinationRepositoryImpl(dataSource);

        return configService.get<string>("LOG_STORAGE") === "fs"
            ? new StorageDestinationRepositoryWithDefault(base)
            : base;
    },
    inject: [StorageDestinationDataSource, ConfigService],
};
