import { Injectable } from "@nestjs/common";

import { ApplicationCatalog } from "../../../domain/entities/application-catalog/application-catalog";
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { AccessControl } from "../../services/access-control";

type GetApplicationVersionInput = {
    creds: {
        token: string;
    },
    params: {
        platform: string;
        application: string;
        version: string;
    },
}

@Injectable()
export class GetApplicationVersionUseCase {
    constructor(
        private readonly accessControl: AccessControl,
        private readonly applicationCatalog: ApplicationCatalog,
    ) {}

    async execute({ creds, params }: GetApplicationVersionInput): Promise<string> {
        await this.accessControl.authenticate(creds);

        const offering = this.applicationCatalog.offeringFor(params.platform, params.application);

        if (!offering || !offering.versions.includes(params.version)) {
            throw new NotFoundResourceError(`${params.platform}/${params.application}/${params.version}`);
        }

        return params.version;
    }
}
