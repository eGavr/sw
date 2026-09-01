import { ConfigService } from "@nestjs/config";

import { CloudCatalog } from "../../../application/interfaces/cloud-catalog";

import { RegisteredCloudCatalog } from "./registered-cloud-catalog";

// Which clouds this installation offers, from CLOUD_CATALOG (comma-separated types, e.g. `local` in dev,
// `yandex-cloud,...` in a hosted install). Unset means all known types — the back-compatible default used
// by tests.
export const RegisteredCloudCatalogProvider = {
    provide: CloudCatalog,
    useFactory: (configService: ConfigService): CloudCatalog => {
        const configured = configService.get<string>("CLOUD_CATALOG");
        const enabledTypes = configured
            ? configured.split(",").map((type) => type.trim()).filter(Boolean)
            : undefined;

        return new RegisteredCloudCatalog(enabledTypes);
    },
    inject: [ConfigService],
};
