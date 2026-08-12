import { Injectable } from "@nestjs/common";

import { AccountId } from "../../../domain/entities/account/account-id";
import { StorageDestination } from "../../../domain/entities/storage/storage-destination";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { AccountRepository } from "../../interfaces/repositories/account-repository";
import { StorageDestinationRepository } from "../../interfaces/repositories/storage-destination-repository";
import { AccessControl } from "../../services/access-control";

type SetAccountStorageDestinationInput = {
    creds: {
        token: string;
    };
    params: {
        accountId: string;
        bucket: string;
        prefix?: string;
        endpoint?: string;
        region?: string;
    };
};

@Injectable()
export class SetAccountStorageDestinationUseCase {
    private readonly permissionName = UserPermissionName.StorageDestination.Set;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly accountRepository: AccountRepository,
        private readonly storageDestinationRepository: StorageDestinationRepository,
    ) {}

    async execute({ creds, params }: SetAccountStorageDestinationInput): Promise<StorageDestination> {
        const user = await this.accessControl.authenticate(creds);
        const accountId = AccountId.fromString(params.accountId);
        const account = await this.accountRepository.get(accountId);

        await this.accessControl.authorize(user, account, this.permissionName);

        const destination = StorageDestination.create({
            bucket: params.bucket,
            prefix: params.prefix,
            endpoint: params.endpoint,
            region: params.region,
        });
        await this.storageDestinationRepository.save(accountId, destination);

        return destination;
    }
}
