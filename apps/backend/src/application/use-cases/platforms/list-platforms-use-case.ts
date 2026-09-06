import { Injectable } from "@nestjs/common";

import {
    ApplicationCatalog,
    PlatformLine,
} from "../../../domain/entities/application-catalog/application-catalog";
import { AccessControl } from "../../services/access-control";

type ListPlatformsInput = {
    creds: {
        token: string;
    },
}

// The platform base-image lines this install provisions. Install-static and not project-scoped — it is
// what a new-environment form offers — so any authenticated caller may read it.
@Injectable()
export class ListPlatformsUseCase {
    constructor(
        private readonly accessControl: AccessControl,
        private readonly applicationCatalog: ApplicationCatalog,
    ) {}

    async execute({ creds }: ListPlatformsInput): Promise<ReadonlyArray<PlatformLine>> {
        await this.accessControl.authenticate(creds);

        return this.applicationCatalog.platformLines();
    }
}
