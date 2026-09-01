import { ConfigService } from "@nestjs/config";

import {
    StorageDelegation,
    StorageDelegationIdentity,
} from "../../application/interfaces/storage-delegation";

class ConfiguredStorageDelegation extends StorageDelegation {
    constructor(private readonly serviceAccountId?: string) {
        super();
    }

    identity(): StorageDelegationIdentity | null {
        if (!this.serviceAccountId) {
            return null;
        }

        return {
            serviceAccountId: this.serviceAccountId,
            role: "storage.editor",
            purpose: "write session logs and video to your bucket",
        };
    }
}

// YC_DELEGATION_STORAGE_SA_ID is the install's published storage identity; unset (dev) publishes none.
export const StorageDelegationProvider = {
    provide: StorageDelegation,
    useFactory: (configService: ConfigService): StorageDelegation =>
        new ConfiguredStorageDelegation(configService.get<string>("YC_DELEGATION_STORAGE_SA_ID")),
    inject: [ConfigService],
};
