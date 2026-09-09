import { CloudAccount } from "../../../../../../domain/entities/cloud-account/cloud-account";
import { Presenter } from "../../../../presenters/presenter";

import { ComputeBindingPresenter } from "./compute-binding-presenter";

// The wire shape of a cloud account: the connection's type plus its compute bindings — what the
// connection actually serves and how. Named the way the caller addressed the project and the way the
// connection was named at connect (its word if it has one, else its uid), so one resource has one name
// wherever it appears. `credentialRef` (the secret-store pointer) is deliberately never exposed.
export class CloudAccountPresenter implements Presenter {
    constructor(
        private readonly cloudAccount: CloudAccount,
        private readonly projectHandle: string,
    ) {}

    present(): object {
        const handle = this.cloudAccount.resourceId ?? this.cloudAccount.id;
        const displayName = this.cloudAccount.displayName;

        return {
            name: `projects/${this.projectHandle}/cloudAccounts/${handle}`,
            uid: this.cloudAccount.id,
            type: this.cloudAccount.type,
            ...(displayName ? { displayName } : {}),
            computeBindings: this.cloudAccount.computeBindings().map(
                (binding) => new ComputeBindingPresenter(binding, this.cloudAccount, this.projectHandle).present(),
            ),
            createTime: this.cloudAccount.createdAt.toISOString(),
            updateTime: this.cloudAccount.updatedAt.toISOString(),
        };
    }
}
