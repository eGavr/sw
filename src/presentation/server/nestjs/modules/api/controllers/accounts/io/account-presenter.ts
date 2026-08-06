import { Account } from "../../../../../../../../domain/entities/account/account";
import { Presenter } from "../../../../../presenters/presenter";

export class AccountPresenter implements Presenter {
    constructor(private readonly account: Account) {}

    present(): object {
        return {
            name: `accounts/${this.account.id}`,
            uid: this.account.id,
            displayName: this.account.name,
            createTime: this.account.createdAt.toISOString(),
            updateTime: this.account.updatedAt.toISOString(),
        };
    }
}
