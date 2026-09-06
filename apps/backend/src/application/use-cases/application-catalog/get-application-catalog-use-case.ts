import { Injectable } from "@nestjs/common";

import {
    ApplicationCatalog,
    ApplicationOffering,
    PlatformLine,
} from "../../../domain/entities/application-catalog/application-catalog";
import { AccessControl } from "../../services/access-control";

type GetApplicationCatalogInput = {
    creds: {
        token: string;
    },
}

export type ApplicationCatalogView = {
    readonly platforms: ReadonlyArray<PlatformLine>;
    readonly applications: ReadonlyArray<ApplicationOffering>;
};

@Injectable()
export class GetApplicationCatalogUseCase {
    constructor(
        private readonly accessControl: AccessControl,
        private readonly applicationCatalog: ApplicationCatalog,
    ) {}

    // The catalog is install-static and not project-scoped — it is what a new-environment form offers —
    // so any authenticated caller may read it.
    async execute({ creds }: GetApplicationCatalogInput): Promise<ApplicationCatalogView> {
        await this.accessControl.authenticate(creds);

        return {
            platforms: this.applicationCatalog.platformLines(),
            applications: this.applicationCatalog.offerings(),
        };
    }
}
