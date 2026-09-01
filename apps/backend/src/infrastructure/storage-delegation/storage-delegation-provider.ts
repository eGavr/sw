import { ConfigService } from "@nestjs/config";

import {
    StorageDelegation,
    StorageProvider,
} from "../../application/interfaces/storage-delegation";

class ConfiguredStorageDelegation extends StorageDelegation {
    constructor(private readonly yandexServiceAccountId?: string) {
        super();
    }

    providers(): ReadonlyArray<StorageProvider> {
        if (!this.yandexServiceAccountId) {
            return [];
        }

        return [{
            id: "yandex-object-storage",
            displayName: "Yandex Object Storage",
            endpoint: "https://storage.yandexcloud.net",
            region: "ru-central1",
            grant: {
                serviceAccountId: this.yandexServiceAccountId,
                role: "storage.editor",
                purpose: "write session logs and video to your bucket",
            },
        }];
    }
}

// YC_DELEGATION_STORAGE_SA_ID is the install's published storage identity; unset (dev) publishes no
// providers — the dev install writes to local disk and there is nothing to grant.
export const StorageDelegationProvider = {
    provide: StorageDelegation,
    useFactory: (configService: ConfigService): StorageDelegation =>
        new ConfiguredStorageDelegation(configService.get<string>("YC_DELEGATION_STORAGE_SA_ID")),
    inject: [ConfigService],
};
