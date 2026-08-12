import { Injectable } from "@nestjs/common";

import { StorageDestinationRepository } from "../../application/interfaces/repositories/storage-destination-repository";
import { AccountId } from "../../domain/entities/account/account-id";
import { StorageDestination } from "../../domain/entities/storage/storage-destination";
import { StorageDestinationDataSource } from "../data-sources/database/postgres/storage-destination-data-source";

@Injectable()
export class StorageDestinationRepositoryImpl extends StorageDestinationRepository {
    constructor(private readonly storageDestinationDataSource: StorageDestinationDataSource) {
        super();
    }

    async find(accountId: AccountId): Promise<StorageDestination | null> {
        const data = await this.storageDestinationDataSource.findOne(accountId.getValue());

        if (!data) {
            return null;
        }

        return StorageDestination.create({
            bucket: data.bucket,
            prefix: data.prefix,
            endpoint: data.endpoint,
            region: data.region,
        });
    }

    async save(accountId: AccountId, destination: StorageDestination): Promise<void> {
        await this.storageDestinationDataSource.save(accountId.getValue(), destination);
    }
}
