import { Injectable } from "@nestjs/common";

import { ApplicationCatalog } from "../../../domain/entities/application-catalog/application-catalog";
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { AccessControl } from "../../services/access-control";

type ListApplicationVersionsInput = {
    creds: {
        token: string;
    },
    params: {
        platform: string;
        application: string;
    },
}

// The versions the install delivers this application at, newest first. A version is its own resource:
// today it carries only its id, but it is where the baking pipeline's attributes (channel, checksums)
// will live.
@Injectable()
export class ListApplicationVersionsUseCase {
    constructor(
        private readonly accessControl: AccessControl,
        private readonly applicationCatalog: ApplicationCatalog,
    ) {}

    async execute({ creds, params }: ListApplicationVersionsInput): Promise<ReadonlyArray<string>> {
        await this.accessControl.authenticate(creds);

        const offering = this.applicationCatalog.offeringFor(params.platform, params.application);

        if (!offering) {
            throw new NotFoundResourceError(`${params.platform}/${params.application}`);
        }

        return offering.versions;
    }
}
