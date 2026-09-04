import { Injectable } from "@nestjs/common";

import { PoolHostNotFoundError } from "../../../domain/entities/host-pool/error/pool-host-not-found-error";
import { PoolHost } from "../../../domain/entities/host-pool/pool-host";
import { PoolHostId } from "../../../domain/entities/host-pool/pool-host-id";
import { PoolHostState } from "../../../domain/entities/host-pool/pool-host-state";
import { PoolHostRepository } from "../../interfaces/repositories/pool-host-repository";

export type RecordHostHeartbeatParams = {
    readonly hostId: PoolHostId;
    readonly hostIp: string;
};

// The host agent's check-in: the first one registers the machine (ordering → ready, records where it
// is reachable), every one refreshes its liveness. The caller answers with the host's desired seats —
// the agent reconciles its slots against them, kubelet-style. A host already chosen for return keeps
// heartbeating until the machine dies; only its liveness is recorded (never a resurrection).
@Injectable()
export class RecordHostHeartbeatUseCase {
    constructor(private readonly poolHostRepository: PoolHostRepository) {}

    async execute(params: RecordHostHeartbeatParams): Promise<PoolHost> {
        const now = new Date();

        const host = await this.poolHostRepository.with(params.hostId, (locked) => {
            if (locked.state === PoolHostState.Deleting) {
                locked.heartbeat(now);
            } else {
                locked.register(params.hostIp, now);
            }
        });

        if (!host) {
            throw new PoolHostNotFoundError(params.hostId.getValue());
        }

        return host;
    }
}
