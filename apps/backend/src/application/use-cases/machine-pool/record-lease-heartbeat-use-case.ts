import { Injectable } from "@nestjs/common";

import { MachineLeaseNotFoundError } from "../../../domain/entities/machine-pool/error/machine-lease-not-found-error";
import { MachineLease } from "../../../domain/entities/machine-pool/machine-lease";
import { MachineLeaseId } from "../../../domain/entities/machine-pool/machine-lease-id";
import { MachineLeaseState } from "../../../domain/entities/machine-pool/machine-lease-state";
import { MachineLeaseRepository } from "../../interfaces/repositories/machine-lease-repository";

export type RecordLeaseHeartbeatParams = {
    readonly leaseId: MachineLeaseId;
    readonly hostIp: string;
};

// The host agent's check-in: the first one registers the machine (ordering → ready, records where it
// is reachable), every one refreshes its liveness. The caller answers with the host's desired seats —
// the agent reconciles its slots against them, kubelet-style. A host already chosen for return keeps
// heartbeating until the machine dies; only its liveness is recorded (never a resurrection).
@Injectable()
export class RecordLeaseHeartbeatUseCase {
    constructor(private readonly machineLeaseRepository: MachineLeaseRepository) {}

    async execute(params: RecordLeaseHeartbeatParams): Promise<MachineLease> {
        const now = new Date();

        const lease = await this.machineLeaseRepository.with(params.leaseId, (locked) => {
            if (locked.state === MachineLeaseState.Deleting) {
                locked.heartbeat(now);
            } else {
                locked.register(params.hostIp, now);
            }
        });

        if (!lease) {
            throw new MachineLeaseNotFoundError(params.leaseId.getValue());
        }

        return lease;
    }
}
