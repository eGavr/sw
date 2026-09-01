import { Injectable } from "@nestjs/common";

import { CloudAccount } from "../../../domain/entities/cloud-account/cloud-account";
import { CloudAccountId } from "../../../domain/entities/cloud-account/cloud-account-id";
import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentState } from "../../../domain/entities/environment/environment-state";
import { EnvironmentProviderGateway } from "../../interfaces/gateways/environment-provider-gateway";
import { CloudAccountRepository } from "../../interfaces/repositories/cloud-account-repository";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";

// Worker scenario: stop the containers of environments the user asked to delete. Idempotent — the
// row stays `deleting` (GC removes it once the heartbeat is stale), so re-running is a cheap no-op.
@Injectable()
export class DeprovisionDeletingEnvironmentsUseCase {
    constructor(
        private readonly environmentRepository: EnvironmentRepository,
        private readonly cloudAccountRepository: CloudAccountRepository,
        private readonly environmentProviderGateway: EnvironmentProviderGateway,
    ) {}

    async execute(): Promise<void> {
        const environments = await this.environmentRepository.listByState(EnvironmentState.Deleting);

        // Best-effort per environment: a failed stop leaves the row `deleting`, so the next cycle retries.
        // The account is loaded so the teardown targets the folder the VM was provisioned in (else it leaks).
        await Promise.allSettled(
            environments.map(async (environment) =>
                this.environmentProviderGateway.deprovision(environment, await this.cloudAccountFor(environment)),
            ),
        );
    }

    private async cloudAccountFor(environment: Environment): Promise<CloudAccount | null> {
        if (!environment.cloudAccountId) {
            return null;
        }

        return this.cloudAccountRepository.get(CloudAccountId.fromString(environment.cloudAccountId));
    }
}
