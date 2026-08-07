import { Injectable } from "@nestjs/common";

import { AccountId } from "../../../domain/entities/account/account-id";
import { IamBinding } from "../../../domain/entities/account/iam/iam-binding";
import { IamPolicy } from "../../../domain/entities/account/iam/iam-policy";
import { Member } from "../../../domain/entities/account/iam/member";
import { Role } from "../../../domain/entities/account/iam/role";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { AccountRepository } from "../../interfaces/repositories/account-repository";
import { AccessControl } from "../../services/access-control";

type SetAccountIamPolicyInput = {
    creds: {
        token: string;
    },
    params: {
        accountId: string;
        bindings: ReadonlyArray<{
            role: string;
            members: ReadonlyArray<string>;
        }>;
    }
}

// google.iam.v1 SetIamPolicy: replace the account's access policy with the given role bindings.
// Requires the setIamPolicy permission (held by the admin role). Unknown roles or malformed members
// are rejected as invalid arguments by the domain value objects.
@Injectable()
export class SetAccountIamPolicyUseCase {
    private readonly permissionName = UserPermissionName.Account.SetIamPolicy;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly accountRepository: AccountRepository,
    ) {}

    async execute({ creds, params }: SetAccountIamPolicyInput): Promise<IamPolicy> {
        const user = await this.accessControl.authenticate(creds);
        const account = await this.accountRepository.get(AccountId.fromString(params.accountId));

        await this.accessControl.authorize(user, account, this.permissionName);

        account.setIamPolicy(this.toPolicy(params.bindings));
        await this.accountRepository.save(account);

        return account.iamPolicy();
    }

    private toPolicy(bindings: SetAccountIamPolicyInput["params"]["bindings"]): IamPolicy {
        return IamPolicy.fromBindings(bindings.map((binding) => IamBinding.create(
            Role.fromName(binding.role).name,
            binding.members.map((member) => Member.fromString(member)),
        )));
    }
}
