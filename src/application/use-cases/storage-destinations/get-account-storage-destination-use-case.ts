import { Injectable } from "@nestjs/common";

import { AccountId } from "../../../domain/entities/account/account-id";
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { StorageDestination } from "../../../domain/entities/storage/storage-destination";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { AccountRepository } from "../../interfaces/repositories/account-repository";
import { StorageDestinationRepository } from "../../interfaces/repositories/storage-destination-repository";
import { AccessControl } from "../../services/access-control";

type GetAccountStorageDestinationInput = {
    creds: {
        token: string;
    };
    params: {
        accountId: string;
    };
};

@Injectable()
export class GetAccountStorageDestinationUseCase {
    private readonly permissionName = UserPermissionName.StorageDestination.Get;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly accountRepository: AccountRepository,
        private readonly storageDestinationRepository: StorageDestinationRepository,
    ) {}

    async execute({ creds, params }: GetAccountStorageDestinationInput): Promise<StorageDestination> {
        const user = await this.accessControl.authenticate(creds);
        const accountId = AccountId.fromString(params.accountId);
        const account = await this.accountRepository.get(accountId);

        await this.accessControl.authorize(user, account, this.permissionName);

        const destination = await this.storageDestinationRepository.find(accountId);

        if (!destination) {
            throw new NotFoundResourceError(`accounts/${params.accountId}/storageDestination`);
        }

        return destination;
    }
}
