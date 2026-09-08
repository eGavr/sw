import { RegistrationTokenGrant } from "../../../../../../application/use-cases/machines/generate-registration-token-use-case";
import { MachineInstallConfig } from "../../../../../../infrastructure/machines/machine-install-config";
import { Presenter } from "../../../../presenters/presenter";

// The one-time registration token and the command that spends it — shown exactly once; only the
// token's hash is kept.
export class RegistrationTokenPresenter implements Presenter {
    constructor(
        private readonly grant: RegistrationTokenGrant,
        private readonly install: MachineInstallConfig,
    ) {}

    present(): object {
        return {
            registrationToken: this.grant.token,
            expireTime: this.grant.expiresAt.toISOString(),
            installCommand: this.install.installCommand(this.grant.machine.id, this.grant.token),
        };
    }
}
