import { Controller, Get } from "@nestjs/common";

import {
    GetApplicationCatalogUseCase,
} from "../../../../../application/use-cases/application-catalog/get-application-catalog-use-case";
import { BearerToken } from "../../../decorators/param/bearer-token";

import { ApplicationCatalogPresenter } from "./io/application-catalog-presenter";

// Install-static singleton (the storageDelegation pattern): what this install delivers onto
// environments — the new-environment form renders from it.
@Controller("applicationCatalog")
export class ApplicationCatalogController {
    constructor(private readonly getApplicationCatalogUseCase: GetApplicationCatalogUseCase) {}

    @Get()
    async getApplicationCatalog(@BearerToken() token: string): Promise<ApplicationCatalogPresenter> {
        return new ApplicationCatalogPresenter(await this.getApplicationCatalogUseCase.execute({ creds: { token } }));
    }
}
