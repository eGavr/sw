import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

import {
    StorageDestination as StorageDestinationEntity,
    StorageDestinationData,
} from "../../../../domain/entities/storage/storage-destination";

import { StorageDestination } from "./typeorm/entities/storage-destination/storage-destination";

@Injectable()
export class StorageDestinationDataSource {
    constructor(private readonly dataSource: DataSource) {}

    async save(projectId: string, destination: StorageDestinationEntity): Promise<void> {
        await this.dataSource.getRepository(StorageDestination).save(StorageDestination.from(projectId, destination));
    }

    async findOne(projectId: string): Promise<StorageDestinationData | null> {
        const row = await this.dataSource.getRepository(StorageDestination).findOne({ where: { projectId } });

        return row?.toObject() ?? null;
    }
}
