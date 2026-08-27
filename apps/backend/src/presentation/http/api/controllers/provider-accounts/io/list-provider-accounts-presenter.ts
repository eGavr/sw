import { ProviderAccount } from "../../../../../../domain/entities/provider-account/provider-account";
import { Presenter } from "../../../../presenters/presenter";

import { ProviderAccountPresenter } from "./provider-account-presenter";

// A project holds only a handful of providers, so the collection is returned whole (no pagination).
export class ListProviderAccountsPresenter implements Presenter {
    constructor(private readonly providerAccounts: Array<ProviderAccount>) {}

    present(): object {
        return {
            providerAccounts: this.providerAccounts.map(
                (providerAccount) => new ProviderAccountPresenter(providerAccount).present(),
            ),
        };
    }
}
