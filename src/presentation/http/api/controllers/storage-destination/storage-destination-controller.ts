import { Body, Controller, Get, Param, Patch } from "@nestjs/common";

import {
    GetAccountStorageDestinationUseCase,
} from "../../../../../application/use-cases/storage-destinations/get-account-storage-destination-use-case";
import {
    SetAccountStorageDestinationUseCase,
} from "../../../../../application/use-cases/storage-destinations/set-account-storage-destination-use-case";
import { BearerToken } from "../../../decorators/param/bearer-token";

import { SetStorageDestinationRequestModel } from "./io/set-storage-destination-request-model";
import { StorageDestinationPresenter } from "./io/storage-destination-presenter";

// AIP-156 singleton sub-resource: accounts/{account}/storageDestination. It has no id and no Create/List
// — Get reads it and Update (PATCH) registers or replaces it (the first PATCH configures it).
@Controller("accounts/:account/storageDestination")
export class StorageDestinationController {
    constructor(
        private readonly getUseCase: GetAccountStorageDestinationUseCase,
        private readonly setUseCase: SetAccountStorageDestinationUseCase,
    ) {}

    @Get()
    async get(@Param("account") account: string, @BearerToken() token: string): Promise<StorageDestinationPresenter> {
        const destination = await this.getUseCase.execute({ creds: { token }, params: { accountId: account } });

        return new StorageDestinationPresenter(destination, account);
    }

    @Patch()
    async set(
        @Param("account") account: string,
        @Body() body: SetStorageDestinationRequestModel,
        @BearerToken() token: string,
    ): Promise<StorageDestinationPresenter> {
        const destination = await this.setUseCase.execute({
            creds: { token },
            params: {
                accountId: account,
                endpoint: body.endpoint,
                region: body.region,
                bucket: body.bucket,
                prefix: body.prefix,
            },
        });

        return new StorageDestinationPresenter(destination, account);
    }
}
