import { Account } from "../../../../../../../../domain/entities/account/account";
import { Response } from "../../../../../dtos/response";

export class CreateAccountResponse extends Response {
    constructor(protected readonly account: Account) {
        super(account);
    }

    toObject(): object {
        return {
            id: this.account.id,
            name: this.account.name,
            createdBy: this.account.createdBy.id,
        }
    }
};
