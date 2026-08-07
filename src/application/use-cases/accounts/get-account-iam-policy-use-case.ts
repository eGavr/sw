import { Injectable } from "@nestjs/common";

import { AccountId } from "../../../domain/entities/account/account-id";
import { IamPolicy } from "../../../domain/entities/account/iam/iam-policy";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { AccountRepository } from "../../interfaces/repositories/account-repository";
import { AccessControl } from "../../services/access-control";

type GetAccountIamPolicyInput = {
    creds: {
        token: string;
    },
    params: {
        accountId: string;
    }
}

// google.iam.v1 GetIamPolicy: read the account's access policy. Requires the getIamPolicy permission
// (held by the admin role), consistent with Google IAM guarding policy reads.
@Injectable()
export class GetAccountIamPolicyUseCase {
    private readonly permissionName = UserPermissionName.Account.GetIamPolicy;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly accountRepository: AccountRepository,
    ) {}

    async execute({ creds, params }: GetAccountIamPolicyInput): Promise<IamPolicy> {
        const user = await this.accessControl.authenticate(creds);
        const account = await this.accountRepository.get(AccountId.fromString(params.accountId));

        await this.accessControl.authorize(user, account, this.permissionName);

        return account.iamPolicy();
    }
}
