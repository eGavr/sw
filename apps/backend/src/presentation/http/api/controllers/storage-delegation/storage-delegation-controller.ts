import { Controller, Get } from "@nestjs/common";

import {
    GetStorageDelegationUseCase,
} from "../../../../../application/use-cases/storage-delegations/get-storage-delegation-use-case";
import { BearerToken } from "../../../decorators/param/bearer-token";

import { StorageDelegationPresenter } from "./io/storage-delegation-presenter";

// Install-static singleton (like cloudTypes): the storage identity to grant bucket access to. The bucket
// setup form reads it to show who to authorize — separate from cloud connect, whose grants are compute.
@Controller("storageDelegation")
export class StorageDelegationController {
    constructor(private readonly getStorageDelegationUseCase: GetStorageDelegationUseCase) {}

    @Get()
    async get(@BearerToken() token: string): Promise<StorageDelegationPresenter> {
        return new StorageDelegationPresenter(
            await this.getStorageDelegationUseCase.execute({ creds: { token } }),
        );
    }
}
