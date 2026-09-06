import { readFileSync } from "fs";

import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
    CatalogSeedApplication,
    EnsureCatalogProjectUseCase,
} from "../../application/use-cases/catalog/ensure-catalog-project-use-case";
import { InternalError } from "../../domain/entities/error/internal-error";

import { defaultCatalogSeed } from "./default-catalog-seed";

// Every instance makes sure the reserved catalog project is in place before serving (idempotent — see
// the use case). CATALOG_ADMIN_EXTERNAL_IDS (comma-separated external ids) names the install admins
// granted roles/admin on it; unset means the catalog is managed by whoever is granted later via
// setIamPolicy. CATALOG_SEED_FILE (a JSON array of seed applications) replaces the built-in first-boot
// set — it seeds an EMPTY catalog only; a running install's catalog lives in the database and is
// managed through the application API.
@Injectable()
export class CatalogBootstrap implements OnApplicationBootstrap {
    constructor(
        private readonly ensureCatalogProjectUseCase: EnsureCatalogProjectUseCase,
        private readonly configService: ConfigService,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        await this.ensureCatalogProjectUseCase.execute({
            params: {
                adminExternalIds: this.adminExternalIds(),
                seed: this.seed(),
            },
        });
    }

    private seed(): ReadonlyArray<CatalogSeedApplication> {
        const file = this.configService.get<string>("CATALOG_SEED_FILE");

        if (!file) {
            return defaultCatalogSeed;
        }

        try {
            return JSON.parse(readFileSync(file, "utf8")) as Array<CatalogSeedApplication>;
        } catch (error) {
            throw new InternalError(
                `catalog seed: cannot load ${file}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    private adminExternalIds(): Array<string> {
        return (this.configService.get<string>("CATALOG_ADMIN_EXTERNAL_IDS") ?? "")
            .split(",")
            .map((externalId) => externalId.trim())
            .filter((externalId) => externalId !== "");
    }
}
