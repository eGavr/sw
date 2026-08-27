import { IamPolicy } from "../../../../../../domain/entities/project/iam/iam-policy";
import { Presenter } from "../../../../presenters/presenter";

// google.iam.v1 Policy wire shape (version + etag + role bindings). The etag is an opaque version tag
// for optimistic concurrency: clients pass it back to setIamPolicy so a stale update is rejected.
export class IamPolicyPresenter implements Presenter {
    constructor(private readonly policy: IamPolicy) {}

    present(): object {
        return {
            version: 1,
            etag: this.policy.etag(),
            bindings: this.policy.toBindings().map((binding) => ({
                role: binding.role,
                members: binding.memberValues(),
            })),
        };
    }
}
