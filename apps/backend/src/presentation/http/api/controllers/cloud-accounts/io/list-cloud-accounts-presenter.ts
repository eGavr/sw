import { CloudAccount } from "../../../../../../domain/entities/cloud-account/cloud-account";
import { Presenter } from "../../../../presenters/presenter";

import { CloudAccountPresenter } from "./cloud-account-presenter";

// A project holds only a handful of clouds, so the collection is returned whole (no pagination).
export class ListCloudAccountsPresenter implements Presenter {
    constructor(private readonly cloudAccounts: Array<CloudAccount>) {}

    present(): object {
        return {
            cloudAccounts: this.cloudAccounts.map((cloudAccount) => new CloudAccountPresenter(cloudAccount).present()),
        };
    }
}
