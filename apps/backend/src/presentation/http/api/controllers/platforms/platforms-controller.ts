import { Controller, Get, Param } from "@nestjs/common";

import { GetPlatformUseCase } from "../../../../../application/use-cases/platforms/get-platform-use-case";
import { ListPlatformsUseCase } from "../../../../../application/use-cases/platforms/list-platforms-use-case";
import { BearerToken } from "../../../decorators/param/bearer-token";

import { ListPlatformsPresenter, PlatformPresenter } from "./io/platform-presenter";

// The platform base-image lines the install provisions (read-only install infrastructure). The
// applications deliverable onto them are PROJECT resources: projects/{project}/platforms/{platform}/
// applications — the reserved catalog project holding the install's provided set.
@Controller("platforms")
export class PlatformsController {
    constructor(
        private readonly listPlatformsUseCase: ListPlatformsUseCase,
        private readonly getPlatformUseCase: GetPlatformUseCase,
    ) {}

    @Get()
    async listPlatforms(@BearerToken() token: string): Promise<ListPlatformsPresenter> {
        return new ListPlatformsPresenter(await this.listPlatformsUseCase.execute({ creds: { token } }));
    }

    @Get(":platform")
    async getPlatform(
        @BearerToken() token: string,
        @Param("platform") platform: string,
    ): Promise<PlatformPresenter> {
        return new PlatformPresenter(
            await this.getPlatformUseCase.execute({ creds: { token }, params: { platform } }),
        );
    }
}
