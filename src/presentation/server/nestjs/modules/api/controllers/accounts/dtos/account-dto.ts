import { Account } from "../../../../../../../../domain/entities/account/account";
import { ResponseDto } from "../../../../../dtos/response-dto";

export class AccountDto implements ResponseDto {
    constructor(private readonly account: Account) {}

    toObject(): object {
        return {
            id: this.account.id,
            name: this.account.name,
            createdBy: this.account.createdBy.id,
            resources: {
                providerId: this.account.resources.providerId,
                providerType: this.account.resources.providerType,
            },
        }
    }
} 
