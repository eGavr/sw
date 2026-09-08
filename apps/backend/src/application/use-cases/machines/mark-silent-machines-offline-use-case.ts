import { Injectable } from "@nestjs/common";

import { MachineId } from "../../../domain/entities/machine/machine-id";
import { SilentMachineCriteria } from "../../../domain/entities/machine/silent-machine-criteria";
import { MachineRepository } from "../../interfaces/repositories/machine-repository";

export type MarkSilentMachinesOfflineParams = {
    readonly silenceAllowanceMs: number;
};

// The inventory's periodic self-audit: a machine whose agent stopped syncing past the allowance is
// marked offline — a fact for the user's eyes and a closed door for the pool (offline is not ready).
// Its lease's fate is the pool's own sweep; the machine comes back online by itself on the next sync.
@Injectable()
export class MarkSilentMachinesOfflineUseCase {
    constructor(private readonly machineRepository: MachineRepository) {}

    async execute(params: MarkSilentMachinesOfflineParams): Promise<void> {
        const criteria = SilentMachineCriteria.from(new Date(), params.silenceAllowanceMs);

        for (const machine of await this.machineRepository.listAll()) {
            await this.machineRepository.with(MachineId.fromString(machine.id), (locked) => {
                locked.markOfflineIfSilent(criteria);
            });
        }
    }
}
