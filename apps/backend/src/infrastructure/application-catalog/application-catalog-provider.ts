import { readFileSync } from "fs";

import { ConfigService } from "@nestjs/config";

import {
    ApplicationCatalog,
    ApplicationCatalogData,
} from "../../domain/entities/application-catalog/application-catalog";
import { InternalError } from "../../domain/entities/error/internal-error";

import { defaultApplicationCatalog } from "./default-application-catalog";

// APPLICATION_CATALOG_FILE points at a JSON of ApplicationCatalogData and replaces the built-in
// catalog wholesale (an install's delivery offer is one honest document, not a merge). Unreadable or
// invalid content fails startup fast — a silently empty catalog would refuse every create-environment.
export const ApplicationCatalogProvider = {
    provide: ApplicationCatalog,
    useFactory: (configService: ConfigService): ApplicationCatalog =>
        ApplicationCatalog.fromObject(loadCatalogData(configService.get<string>("APPLICATION_CATALOG_FILE"))),
    inject: [ConfigService],
};

function loadCatalogData(file?: string): ApplicationCatalogData {
    if (!file) {
        return defaultApplicationCatalog;
    }

    try {
        return JSON.parse(readFileSync(file, "utf8")) as ApplicationCatalogData;
    } catch (error) {
        throw new InternalError(
            `application catalog: cannot load ${file}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}
