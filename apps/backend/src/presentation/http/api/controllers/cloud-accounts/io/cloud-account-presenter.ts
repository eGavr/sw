import { CloudAccount } from "../../../../../../domain/entities/cloud-account/cloud-account";
import { Presenter } from "../../../../presenters/presenter";

import { ComputeBindingPresenter } from "./compute-binding-presenter";

// The wire shape of a cloud account: the connection's type plus its compute bindings — what the
// connection actually serves and how. `credentialRef` (the secret-store pointer) is deliberately
// never exposed.
export class CloudAccountPresenter implements Presenter {
    constructor(private readonly cloudAccount: CloudAccount) {}

    present(): object {
        return {
            name: `projects/${this.cloudAccount.projectId.getValue()}/cloudAccounts/${this.cloudAccount.id}`,
            uid: this.cloudAccount.id,
            type: this.cloudAccount.type,
            computeBindings: this.cloudAccount.computeBindings().map(
                (binding) => new ComputeBindingPresenter(binding, this.cloudAccount).present(),
            ),
            createTime: this.cloudAccount.createdAt.toISOString(),
            updateTime: this.cloudAccount.updatedAt.toISOString(),
        };
    }
}
