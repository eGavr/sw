import { ProviderAccount } from "../../../../../../domain/entities/provider-account/provider-account";
import { Presenter } from "../../../../presenters/presenter";

// The wire shape of a provider account. `config` is the non-secret provisioning blob; `credentialRef`
// (the secret-store pointer) is deliberately never exposed.
export class ProviderAccountPresenter implements Presenter {
    constructor(private readonly providerAccount: ProviderAccount) {}

    present(): object {
        return {
            name: `projects/${this.providerAccount.projectId.getValue()}/providerAccounts/${this.providerAccount.id}`,
            uid: this.providerAccount.id,
            provider: this.providerAccount.provider,
            platform: this.providerAccount.platformName,
            execution: this.providerAccount.execution,
            config: this.providerAccount.config,
            state: this.providerAccount.state,
            createTime: this.providerAccount.createdAt.toISOString(),
            updateTime: this.providerAccount.updatedAt.toISOString(),
        };
    }
}
