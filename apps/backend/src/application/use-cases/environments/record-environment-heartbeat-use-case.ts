import { Injectable } from "@nestjs/common";

import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentEndpoint } from "../../../domain/entities/environment/environment-endpoint";
import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { EnvironmentOccupancy } from "../../../domain/entities/environment/environment-occupancy";
import { EnvironmentState } from "../../../domain/entities/environment/environment-state";
import { EnvironmentNotFoundError } from "../../../domain/entities/environment/error/environment-not-found-error";
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
// included) records the session word and refreshes liveness. It runs under the storage lock (`with`)
// so the occupancy merge — busy=false must not wipe a reservation placed a moment ago — is decided
// against the freshest row. Out-of-order heartbeats (env not preparing/executing) are rejected by the
// domain as a state conflict, so the agent simply retries.
@Injectable()
export class RecordEnvironmentHeartbeatUseCase {
    constructor(
        private readonly environmentRepository: EnvironmentRepository,
        private readonly sessionOwnershipRepository: SessionOwnershipRepository,
    ) {}

    async execute(params: RecordEnvironmentHeartbeatParams): Promise<Environment> {
        const environmentId = EnvironmentId.fromString(params.environmentId);
        const now = new Date();
        let sessionEnded = false;

        const environment = await this.environmentRepository.with(environmentId, (current) => {
            if (current.state === EnvironmentState.Preparing) {
                if (!params.endpoint) {
                    throw new InvalidArgumentError("environment heartbeat: registration requires an endpoint");
                }

                current.register(new EnvironmentEndpoint(params.endpoint), now);
            }

            sessionEnded = current.occupancy === EnvironmentOccupancy.Busy && !params.busy;

            current.heartbeat(params.busy, now);
        });

        if (!environment) {
            throw new EnvironmentNotFoundError(params.environmentId);
        }

        // The session's end is observed here whatever killed it (idle-kill by the node, a capability
        // DELETE straight to wd, a crash) — so this is where its ownership metadata dies too.
        if (sessionEnded) {
            await this.sessionOwnershipRepository.deleteByEnvironment(environmentId);
        }

        return environment;
    }
}
