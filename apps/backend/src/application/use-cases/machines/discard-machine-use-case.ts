import { Injectable } from "@nestjs/common";

import { MachineId } from "../../../domain/entities/machine/machine-id";
import { MachineRepository } from "../../interfaces/repositories/machine-repository";

export type DiscardMachineParams = {
    readonly leaseId: string;
};

// An ordered machine is forgotten together with its lease (the cloud's server is gone or going).
// Idempotent.
@Injectable()
export class DiscardMachineUseCase {
    constructor(private readonly machineRepository: MachineRepository) {}

    async execute(params: DiscardMachineParams): Promise<void> {
        const held = await this.machineRepository.findByLease(params.leaseId);

        if (held) {
            await this.machineRepository.delete(MachineId.fromString(held.id));
        }
    }
}
