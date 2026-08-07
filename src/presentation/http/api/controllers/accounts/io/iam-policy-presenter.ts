import { IamPolicy } from "../../../../../../domain/entities/account/iam/iam-policy";
import { Presenter } from "../../../../presenters/presenter";

// google.iam.v1 Policy wire shape (version + role bindings). We do not use an etag for optimistic
// concurrency yet, so it is omitted.
export class IamPolicyPresenter implements Presenter {
    constructor(private readonly policy: IamPolicy) {}

    present(): object {
        return {
            version: 1,
            bindings: this.policy.toBindings().map((binding) => ({
                role: binding.role,
                members: binding.memberValues(),
            })),
        };
    }
}
