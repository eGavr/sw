import { Injectable } from "@nestjs/common";

import { MachineId } from "../../../domain/entities/machine/machine-id";
import { MachineRepository } from "../../interfaces/repositories/machine-repository";

export type ReleaseMachineParams = {
    readonly leaseId: string;
};

// The pool gives a machine back: the lease ended (idle, written off, returned). The machine stays in the
// inventory for the next lease — unless it was draining, in which case release is its graceful detach.
// Idempotent: a lease whose machine is already gone is nothing to release.
@Injectable()
export class ReleaseMachineUseCase {
    constructor(private readonly machineRepository: MachineRepository) {}

    async execute(params: ReleaseMachineParams): Promise<void> {
        const held = await this.machineRepository.findByLease(params.leaseId);

        if (!held) {
            return;
        }

        const machineId = MachineId.fromString(held.id);
        const released = await this.machineRepository.with(machineId, (locked) => {
            if (locked.leaseId === params.leaseId) {
                locked.release();
            }
        });

        if (released?.isDrained()) {
            await this.machineRepository.delete(machineId);
        }
    }
}
