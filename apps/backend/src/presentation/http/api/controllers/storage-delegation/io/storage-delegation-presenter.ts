import { StorageDelegationIdentity } from "../../../../../../application/interfaces/storage-delegation";
import { Presenter } from "../../../../presenters/presenter";

// The install's published storage identity — who the user grants bucket access to, and why.
export class StorageDelegationPresenter implements Presenter {
    constructor(private readonly identity: StorageDelegationIdentity) {}

    present(): object {
        return {
            name: "storageDelegation",
            serviceAccountId: this.identity.serviceAccountId,
            role: this.identity.role,
            purpose: this.identity.purpose,
        };
    }
}
