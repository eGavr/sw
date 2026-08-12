import { Column, Entity, PrimaryColumn } from "typeorm";

import {
    StorageDestination as StorageDestinationEntity,
    StorageDestinationData,
} from "../../../../../../../domain/entities/storage/storage-destination";

// One row per account (account_id is the primary key): the singleton storage destination. Access is
// delegated to our service identity via a bucket policy, so no credentials are stored here.
@Entity()
export class StorageDestination {
    static from(accountId: string, destination: StorageDestinationEntity): StorageDestination {
        const data = destination.toObject();
        const row = new StorageDestination();

        row.accountId = accountId;
        row.endpoint = data.endpoint ?? null;
        row.region = data.region ?? null;
        row.bucket = data.bucket;
        row.prefix = data.prefix;

        return row;
    }

    @PrimaryColumn("uuid")
    accountId: string;

    @Column({ type: "varchar", nullable: true })
    endpoint: string | null;

    @Column({ type: "varchar", nullable: true })
    region: string | null;

    @Column()
    bucket: string;

    @Column()
    prefix: string;

    private constructor() {}

    toObject(): StorageDestinationData {
        return {
            bucket: this.bucket,
            prefix: this.prefix,
            endpoint: this.endpoint ?? undefined,
            region: this.region ?? undefined,
        };
    }
}
