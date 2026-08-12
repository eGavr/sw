import { Injectable } from "@nestjs/common";

import { EnvironmentState } from "../../../domain/entities/environment/environment-state";
import { EnvironmentProviderGateway } from "../../interfaces/gateways/environment-provider-gateway";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";

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

        // Best-effort per environment: a failed stop leaves the row `deleting`, so the next cycle retries.
        await Promise.allSettled(
            environments.map((environment) => this.environmentProviderGateway.deprovision(environment)),
        );
    }
}
