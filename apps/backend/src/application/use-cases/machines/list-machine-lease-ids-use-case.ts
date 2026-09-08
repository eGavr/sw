import { Injectable } from "@nestjs/common";

import { MachineRepository } from "../../interfaces/repositories/machine-repository";

export type ListMachineLeaseIdsParams = {
    readonly cloudAccountId: string;
};

// Which leases the cloud's machines are held under — the pool's orphan sweep reads this to free machines
// whose lease row it lost.
@Injectable()
export class ListMachineLeaseIdsUseCase {
    constructor(private readonly machineRepository: MachineRepository) {}

    async execute(params: ListMachineLeaseIdsParams): Promise<Array<string>> {
        return this.machineRepository.listLeaseIds(params.cloudAccountId);
    }
}
