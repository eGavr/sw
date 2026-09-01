import { ConfigService } from "@nestjs/config";

import { CloudCatalog } from "../../../application/interfaces/cloud-catalog";

import { RegisteredCloudCatalog } from "./registered-cloud-catalog";

// Which clouds this installation offers, from CLOUD_CATALOG (comma-separated types, e.g. `local` in dev,
// `yandex-cloud,...` in a hosted install). Unset means all known types — the back-compatible default used
// by tests. The YC_DELEGATION_* ids are the install's published service accounts the user grants roles to
// on their own cloud; unset (dev) lists no grants.
export const RegisteredCloudCatalogProvider = {
    provide: CloudCatalog,
    useFactory: (configService: ConfigService): CloudCatalog => {
        const configured = configService.get<string>("CLOUD_CATALOG");
        const enabledTypes = configured
            ? configured.split(",").map((type) => type.trim()).filter(Boolean)
            : undefined;

        return new RegisteredCloudCatalog(enabledTypes, {
            computeServiceAccountId: configService.get<string>("YC_DELEGATION_COMPUTE_SA_ID"),
            storageServiceAccountId: configService.get<string>("YC_DELEGATION_STORAGE_SA_ID"),
        });
    },
    inject: [ConfigService],
};
