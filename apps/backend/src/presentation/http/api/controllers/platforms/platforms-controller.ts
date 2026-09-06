import { Controller, Get, Param } from "@nestjs/common";

import {
    GetPlatformApplicationUseCase,
} from "../../../../../application/use-cases/platforms/get-platform-application-use-case";
import { GetPlatformUseCase } from "../../../../../application/use-cases/platforms/get-platform-use-case";
import {
    ListPlatformApplicationsUseCase,
} from "../../../../../application/use-cases/platforms/list-platform-applications-use-case";
import { ListPlatformsUseCase } from "../../../../../application/use-cases/platforms/list-platforms-use-case";
import { BearerToken } from "../../../decorators/param/bearer-token";

import {
    ListPlatformApplicationsPresenter,
    PlatformApplicationPresenter,
} from "./io/platform-application-presenter";
import { ListPlatformsPresenter, PlatformPresenter } from "./io/platform-presenter";

// The install's delivery catalog as AIP resources (the cloudTypes pattern, read-only): the platform
// base-image lines and, under each, the applications the install itself delivers. The new-environment
// form renders from these two lists.
@Controller("platforms")
export class PlatformsController {
    constructor(
        private readonly listPlatformsUseCase: ListPlatformsUseCase,
        private readonly getPlatformUseCase: GetPlatformUseCase,
        private readonly listPlatformApplicationsUseCase: ListPlatformApplicationsUseCase,
        private readonly getPlatformApplicationUseCase: GetPlatformApplicationUseCase,
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

    @Get(":platform/applications")
    async listPlatformApplications(
        @BearerToken() token: string,
        @Param("platform") platform: string,
    ): Promise<ListPlatformApplicationsPresenter> {
        return new ListPlatformApplicationsPresenter(
            await this.listPlatformApplicationsUseCase.execute({ creds: { token }, params: { platform } }),
        );
    }

    @Get(":platform/applications/:application")
    async getPlatformApplication(
        @BearerToken() token: string,
        @Param("platform") platform: string,
        @Param("application") application: string,
    ): Promise<PlatformApplicationPresenter> {
        return new PlatformApplicationPresenter(
            await this.getPlatformApplicationUseCase.execute({ creds: { token }, params: { platform, application } }),
        );
    }
}
