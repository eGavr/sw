import { StorageDestination } from "../../../../../../domain/entities/storage/storage-destination";
import { Presenter } from "../../../../presenters/presenter";

// Presents the project's storage destination. Credentials are write-only: they are never part of the
// response — only the location (endpoint/region/bucket/prefix) is returned.
export class StorageDestinationPresenter implements Presenter {
    constructor(private readonly destination: StorageDestination, private readonly projectId: string) {}

    present(): object {
        // Unset optional fields are omitted, not null — the same wire convention as every other presenter.
        return {
            name: `projects/${this.projectId}/storageDestination`,
            ...(this.destination.endpoint ? { endpoint: this.destination.endpoint } : {}),
            ...(this.destination.region ? { region: this.destination.region } : {}),
            bucket: this.destination.bucket,
            prefix: this.destination.prefix,
        };
    }
}
