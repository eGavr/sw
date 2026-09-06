import { Injectable } from "@nestjs/common";

import {
    ApplicationCatalog,
    PlatformLine,
} from "../../../domain/entities/application-catalog/application-catalog";
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { AccessControl } from "../../services/access-control";

type GetPlatformInput = {
    creds: {
        token: string;
    },
    params: {
        platform: string;
    },
}

@Injectable()
export class GetPlatformUseCase {
    constructor(
        private readonly accessControl: AccessControl,
        private readonly applicationCatalog: ApplicationCatalog,
    ) {}

    async execute({ creds, params }: GetPlatformInput): Promise<PlatformLine> {
        await this.accessControl.authenticate(creds);

        const line = this.applicationCatalog.platformLine(params.platform);

        if (!line) {
            throw new NotFoundResourceError(params.platform);
        }

        return line;
    }
}
