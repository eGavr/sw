import { Injectable } from "@nestjs/common";

import {
    PlatformCatalog,
    PlatformLine,
} from "../../../domain/entities/application-catalog/platform-catalog";
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
        private readonly platformCatalog: PlatformCatalog,
    ) {}

    async execute({ creds }: ListPlatformsInput): Promise<ReadonlyArray<PlatformLine>> {
        await this.accessControl.authenticate(creds);

        return this.platformCatalog.lines();
    }
}
