import { Account } from "../../../../../../../../domain/entities/account/account";
import { ResponseDto } from "../../../../../dtos/response-dto";

export class AccountDto implements ResponseDto {
    constructor(private readonly account: Account) {}

    toObject(): object {
        return {
            name: `accounts/${this.account.id}`,
            uid: this.account.id,
            displayName: this.account.name,
            createTime: this.account.createdAt.toISOString(),
            updateTime: this.account.updatedAt.toISOString(),
            resources: {
                providerId: this.account.resources.providerId,
                providerType: this.account.resources.providerType,
            },
        };
    }
}
