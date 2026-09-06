import { Injectable } from "@nestjs/common";

import {
    PlatformCatalog,
    PlatformLine,
} from "../../../domain/entities/application-catalog/platform-catalog";
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
        private readonly platformCatalog: PlatformCatalog,
    ) {}

    async execute({ creds, params }: GetPlatformInput): Promise<PlatformLine> {
        await this.accessControl.authenticate(creds);

        const line = this.platformCatalog.line(params.platform);

        if (!line) {
            throw new NotFoundResourceError(params.platform);
        }

        return line;
    }
}
