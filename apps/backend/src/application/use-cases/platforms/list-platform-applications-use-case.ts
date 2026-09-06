import { Injectable } from "@nestjs/common";

import {
    ApplicationCatalog,
    ApplicationOffering,
} from "../../../domain/entities/application-catalog/application-catalog";
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { AccessControl } from "../../services/access-control";

type ListPlatformApplicationsInput = {
    creds: {
        token: string;
    },
    params: {
        platform: string;
    },
}

// The applications the install itself delivers onto the platform (canonical name, wire aliases,
// versions newest-first). A custom (user-artifact) application is not a catalog resource.
@Injectable()
export class ListPlatformApplicationsUseCase {
    constructor(
        private readonly accessControl: AccessControl,
        private readonly applicationCatalog: ApplicationCatalog,
    ) {}

    async execute({ creds, params }: ListPlatformApplicationsInput): Promise<ReadonlyArray<ApplicationOffering>> {
        await this.accessControl.authenticate(creds);

        if (!this.applicationCatalog.platformLine(params.platform)) {
            throw new NotFoundResourceError(params.platform);
        }

        return this.applicationCatalog.offeringsFor(params.platform);
    }
}
