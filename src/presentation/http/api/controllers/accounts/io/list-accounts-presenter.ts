import { Account } from "../../../../../../domain/entities/account/account";
import { Presenter } from "../../../../presenters/presenter";

import { AccountPresenter } from "./account-presenter";

export class ListAccountsPresenter implements Presenter {
    constructor(
        private readonly accounts: Array<Account>,
        private readonly nextPageToken?: string,
    ) {}

    present(): object {
        return {
            accounts: this.accounts.map((account) => new AccountPresenter(account).present()),
            nextPageToken: this.nextPageToken,
        };
    }
}
