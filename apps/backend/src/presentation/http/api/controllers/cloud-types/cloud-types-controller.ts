import { Controller, Get } from "@nestjs/common";

import {
    ListCloudTypesUseCase,
} from "../../../../../application/use-cases/cloud-types/list-cloud-types-use-case";
import { BearerToken } from "../../../decorators/param/bearer-token";

import { ListCloudTypesPresenter } from "./io/list-cloud-types-presenter";

@Controller("cloudTypes")
export class CloudTypesController {
    constructor(private readonly listCloudTypesUseCase: ListCloudTypesUseCase) {}

    @Get()
    async listCloudTypes(@BearerToken() token: string): Promise<ListCloudTypesPresenter> {
        return new ListCloudTypesPresenter(await this.listCloudTypesUseCase.execute({ creds: { token } }));
    }
}
