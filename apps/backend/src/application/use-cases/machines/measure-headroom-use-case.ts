import { Injectable } from "@nestjs/common";

import { Stereotype } from "../../../domain/entities/cloud-account/stereotype";
import { FreeMachineCriteria } from "../../../domain/entities/machine/free-machine-criteria";
import { MachineRepository } from "../../interfaces/repositories/machine-repository";

export type MeasureHeadroomParams = {
    readonly cloudAccountId: string;
    readonly stereotype: Stereotype;
};

export type MachineHeadroom = {
    readonly count: number;
    // The slots of the machine the pool would get next (the claim takes the oldest free one), so a
    // lease can be born with its real capacity; null when nothing is free.
    readonly nextSlotCapacity: number | null;
};

// How many more machines the cloud can hand the pool for a stereotype right now — its free, ready
// ones — and the size of the next one.
@Injectable()
export class MeasureHeadroomUseCase {
    constructor(private readonly machineRepository: MachineRepository) {}

    async execute(params: MeasureHeadroomParams): Promise<MachineHeadroom> {
        const criteria = FreeMachineCriteria.for(params.cloudAccountId, params.stereotype);
        const count = await this.machineRepository.countFree(criteria);
        const next = count > 0 ? await this.machineRepository.findNextFree(criteria) : null;

        return { count, nextSlotCapacity: next?.slotCapacity ?? null };
    }
}
