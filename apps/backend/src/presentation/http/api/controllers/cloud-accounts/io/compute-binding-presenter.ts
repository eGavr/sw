import { CloudAccount } from "../../../../../../domain/entities/cloud-account/cloud-account";
import { ComputeBinding } from "../../../../../../domain/entities/cloud-account/compute-binding";
import { Presenter } from "../../../../presenters/presenter";

// One substrate of the connection and the compute kind that runs it, with the kind's non-secret config.
export class ComputeBindingPresenter implements Presenter {
    constructor(
        private readonly binding: ComputeBinding,
        private readonly cloudAccount: CloudAccount,
    ) {}

    present(): object {
        return {
            name: `projects/${this.cloudAccount.projectId.getValue()}`
                + `/cloudAccounts/${this.cloudAccount.id}/computeBindings/${this.binding.id}`,
            uid: this.binding.id,
            platform: this.binding.stereotype.platformName,
            execution: this.binding.stereotype.execution,
            kind: this.binding.kind,
            config: this.binding.config,
        };
    }
}
