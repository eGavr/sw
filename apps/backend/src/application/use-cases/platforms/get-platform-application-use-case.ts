import { Injectable } from "@nestjs/common";

import {
    ApplicationCatalog,
    ApplicationOffering,
} from "../../../domain/entities/application-catalog/application-catalog";
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { AccessControl } from "../../services/access-control";

type GetPlatformApplicationInput = {
    creds: {
        token: string;
    },
    params: {
        platform: string;
        application: string;
    },
}

@Injectable()
export class GetPlatformApplicationUseCase {
    constructor(
        private readonly accessControl: AccessControl,
        private readonly applicationCatalog: ApplicationCatalog,
    ) {}

    async execute({ creds, params }: GetPlatformApplicationInput): Promise<ApplicationOffering> {
        await this.accessControl.authenticate(creds);

        const offering = this.applicationCatalog.offeringFor(params.platform, params.application);

        if (!offering) {
            throw new NotFoundResourceError(`${params.platform}/${params.application}`);
        }

        return offering;
    }
}
