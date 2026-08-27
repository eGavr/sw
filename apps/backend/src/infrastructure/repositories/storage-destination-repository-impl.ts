import { Injectable } from "@nestjs/common";

import { StorageDestinationRepository } from "../../application/interfaces/repositories/storage-destination-repository";
import { ProjectId } from "../../domain/entities/project/project-id";
import { StorageDestination } from "../../domain/entities/storage/storage-destination";
import { StorageDestinationDataSource } from "../data-sources/database/postgres/storage-destination-data-source";

@Injectable()
export class StorageDestinationRepositoryImpl extends StorageDestinationRepository {
    constructor(private readonly storageDestinationDataSource: StorageDestinationDataSource) {
        super();
    }

    async find(projectId: ProjectId): Promise<StorageDestination | null> {
        const data = await this.storageDestinationDataSource.findOne(projectId.getValue());

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

    async save(projectId: ProjectId, destination: StorageDestination): Promise<void> {
        await this.storageDestinationDataSource.save(projectId.getValue(), destination);
    }
}
