import { Injectable } from "@nestjs/common";

import { EnvironmentProviderGateway } from "../../../data/gateways/environment-provider/environment-provider-gateway";
import { EnvironmentRepository } from "../../../data/repositories/environment-repository";
import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentState } from "../../../domain/entities/environment/environment-state";

// Worker scenario: stop the containers of environments the user asked to delete. Idempotent — the
// row stays `deleting` (GC removes it once the heartbeat is stale), so re-running is a cheap no-op.
@Injectable()
export class DeprovisionDeletingEnvironmentsUseCase {
    constructor(
        private readonly environmentRepository: EnvironmentRepository,
        private readonly environmentProviderGateway: EnvironmentProviderGateway,
    ) {}

    async execute(): Promise<void> {
        const environments = await this.environmentRepository.listByState(EnvironmentState.Deleting);

        await Promise.all(environments.map((environment) => this.deprovisionQuietly(environment)));
    }

    private async deprovisionQuietly(environment: Environment): Promise<void> {
        try {
            await this.environmentProviderGateway.deprovision(environment);
        } catch {
            // Best-effort; still `deleting`, so the next cycle retries the deprovision.
        }
    }
}
