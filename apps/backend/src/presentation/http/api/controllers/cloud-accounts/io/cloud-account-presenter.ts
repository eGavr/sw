import { CloudAccount } from "../../../../../../domain/entities/cloud-account/cloud-account";
import { Presenter } from "../../../../presenters/presenter";

// The wire shape of a cloud account. `provides` is output-only (the substrates the cloud provisions,
// derived from its type); `credentialRef` (the secret-store pointer) is deliberately never exposed.
export class CloudAccountPresenter implements Presenter {
    constructor(private readonly cloudAccount: CloudAccount) {}

    present(): object {
        return {
            name: `projects/${this.cloudAccount.projectId.getValue()}/cloudAccounts/${this.cloudAccount.id}`,
            uid: this.cloudAccount.id,
            type: this.cloudAccount.type,
            config: this.cloudAccount.config,
            provides: this.cloudAccount.providedStereotypes().map((stereotype) => ({
                platform: stereotype.platformName,
                execution: stereotype.execution,
            })),
            state: this.cloudAccount.state,
            createTime: this.cloudAccount.createdAt.toISOString(),
            updateTime: this.cloudAccount.updatedAt.toISOString(),
        };
    }
}
