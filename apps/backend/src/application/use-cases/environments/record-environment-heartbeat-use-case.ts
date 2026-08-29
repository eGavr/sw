import { Injectable } from "@nestjs/common";

import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentEndpoint } from "../../../domain/entities/environment/environment-endpoint";
import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { EnvironmentState } from "../../../domain/entities/environment/environment-state";
import { InvalidArgumentError } from "../../../domain/entities/error/invalid-argument-error";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { SessionOwnershipRepository } from "../../interfaces/repositories/session-ownership-repository";

export type RecordEnvironmentHeartbeatParams = {
    readonly environmentId: string;
    readonly endpoint?: string;
    readonly busy: boolean;
};

// Internal scenario: the agent inside the container heartbeats. The FIRST heartbeat is registration —
// it carries the endpoint and moves the environment `preparing → executing`; every heartbeat (first
// included) records busy and refreshes liveness. Out-of-order heartbeats (env not preparing/executing)
// are rejected by the domain as a state conflict, so the agent simply retries.
@Injectable()
export class RecordEnvironmentHeartbeatUseCase {
    constructor(
        private readonly environmentRepository: EnvironmentRepository,
        private readonly sessionOwnershipRepository: SessionOwnershipRepository,
    ) {}

    async execute(params: RecordEnvironmentHeartbeatParams): Promise<Environment> {
        const environment = await this.environmentRepository.get(EnvironmentId.fromString(params.environmentId));
        const now = new Date();

        if (environment.state === EnvironmentState.Preparing) {
            if (!params.endpoint) {
                throw new InvalidArgumentError("environment heartbeat: registration requires an endpoint");
            }

            environment.register(new EnvironmentEndpoint(params.endpoint), now);
        }

        const sessionEnded = environment.busy && !params.busy;

        environment.heartbeat(params.busy, now);
        await this.environmentRepository.save(environment);

        // The session's end is observed here whatever killed it (idle-kill by the node, a capability
        // DELETE straight to wd, a crash) — so this is where its ownership metadata dies too.
        if (sessionEnded) {
            await this.sessionOwnershipRepository.deleteByEnvironment(EnvironmentId.fromString(environment.id));
        }

        return environment;
    }
}
