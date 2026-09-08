import { Injectable } from "@nestjs/common";

import { Stereotype } from "../../../domain/entities/cloud-account/stereotype";
import { FreeMachineCriteria } from "../../../domain/entities/machine/free-machine-criteria";
import { Machine } from "../../../domain/entities/machine/machine";
import { MachineRepository } from "../../interfaces/repositories/machine-repository";

export type ClaimMachineParams = {
    readonly cloudAccountId: string;
    readonly stereotype: Stereotype;
    readonly leaseId: string;
};

// The pool takes a free machine of the cloud for a lease — "give me one" answered from the inventory.
// Idempotent per lease (a retry gets the machine it already holds); null when none is free.
@Injectable()
export class ClaimMachineUseCase {
    constructor(private readonly machineRepository: MachineRepository) {}

    async execute(params: ClaimMachineParams): Promise<Machine | null> {
        const held = await this.machineRepository.findByLease(params.leaseId);

        if (held) {
            return held;
        }

        return this.machineRepository.withFreeMachine(
            FreeMachineCriteria.for(params.cloudAccountId, params.stereotype),
            (machine) => {
                machine.claim(params.leaseId);
            },
        );
    }
}
