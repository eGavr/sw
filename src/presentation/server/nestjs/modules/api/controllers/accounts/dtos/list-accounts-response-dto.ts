import { Account } from "../../../../../../../../domain/entities/account/account";
import { ResponseDto } from "../../../../../dtos/response-dto";

import { AccountDto } from "./account-dto";

export class ListAccountsResponseDto implements ResponseDto {
    constructor(
        private readonly accounts: Array<Account>,
        private readonly nextPageToken?: string,
    ) {}

    toObject(): object {
        return {
            accounts: this.accounts.map((account) => new AccountDto(account).toObject()),
            nextPageToken: this.nextPageToken,
        };
    }
}
