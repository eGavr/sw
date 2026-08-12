import { StorageDestination } from "../../../../../../domain/entities/storage/storage-destination";
import { Presenter } from "../../../../presenters/presenter";

// Presents the account's storage destination. Credentials are write-only: they are never part of the
// response — only the location (endpoint/region/bucket/prefix) is returned.
export class StorageDestinationPresenter implements Presenter {
    constructor(private readonly destination: StorageDestination, private readonly accountId: string) {}

    present(): object {
        return {
            name: `accounts/${this.accountId}/storageDestination`,
            endpoint: this.destination.endpoint ?? null,
            region: this.destination.region ?? null,
            bucket: this.destination.bucket,
            prefix: this.destination.prefix,
        };
    }
}
