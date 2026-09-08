import { Injectable } from "@nestjs/common";

import { MachineLease } from "../../../domain/entities/machine-pool/machine-lease";
import { MachineLeaseId } from "../../../domain/entities/machine-pool/machine-lease-id";
import { MachineLeaseRepository } from "../../interfaces/repositories/machine-lease-repository";

export type GetMachineLeaseParams = {
    readonly leaseId: MachineLeaseId;
};

// A lease as it stands — what the machine inventory asks when showing who holds one of its machines.
@Injectable()
export class GetMachineLeaseUseCase {
    constructor(private readonly machineLeaseRepository: MachineLeaseRepository) {}

    async execute(params: GetMachineLeaseParams): Promise<MachineLease | null> {
        return this.machineLeaseRepository.find(params.leaseId);
    }
}
