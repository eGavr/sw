import { StorageProvider } from "../../../../../../application/interfaces/storage-delegation";
import { Presenter } from "../../../../presenters/presenter";

// The storage services the install can write artifacts to, each with the identity the user grants on
// their bucket. The setup form renders this as a select — nothing outside this list is supported.
export class StorageDelegationPresenter implements Presenter {
    constructor(private readonly providers: ReadonlyArray<StorageProvider>) {}

    present(): object {
        return {
            name: "storageDelegation",
            providers: this.providers.map((provider) => ({
                id: provider.id,
                displayName: provider.displayName,
                endpoint: provider.endpoint,
                region: provider.region,
                grant: {
                    serviceAccountId: provider.grant.serviceAccountId,
                    role: provider.grant.role,
                    purpose: provider.grant.purpose,
                },
            })),
        };
    }
}
