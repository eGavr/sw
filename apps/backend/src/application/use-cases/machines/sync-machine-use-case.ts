import { Injectable } from "@nestjs/common";

import { MachineNotFoundError } from "../../../domain/entities/machine/error/machine-not-found-error";
import { Machine } from "../../../domain/entities/machine/machine";
import { MachineFacts, MachineFactsData } from "../../../domain/entities/machine/machine-facts";
import { MachineId } from "../../../domain/entities/machine/machine-id";
import { SlotCapacityPolicy } from "../../../domain/entities/machine/slot-capacity-policy";
import { DesiredAssignment, MachinePoolGateway } from "../../interfaces/gateways/machine-pool-gateway";
import { MachineRepository } from "../../interfaces/repositories/machine-repository";

export type SyncMachineParams = {
    readonly machineId: MachineId;
    readonly facts: MachineFactsData;
};

export type MachineSync = {
    readonly machine: Machine;
    readonly assignments: ReadonlyArray<DesiredAssignment>;
};

// The machine agent's check-in, every few seconds: fresh facts and liveness on the machine, and — when
// the pool holds it — the lease's liveness too, answered with what the lease wants running. A lease the
// pool forgot frees the machine on the spot.
@Injectable()
export class SyncMachineUseCase {
    constructor(
        private readonly machineRepository: MachineRepository,
        private readonly machinePool: MachinePoolGateway,
        private readonly slotCapacityPolicy: SlotCapacityPolicy,
    ) {}

    async execute(params: SyncMachineParams): Promise<MachineSync> {
        const now = new Date();
        const facts = MachineFacts.fromObject(params.facts);
        const machine = await this.machineRepository.with(params.machineId, (locked) => {
            locked.sync(facts, now, this.slotCapacityPolicy);
        });

        if (!machine) {
            throw new MachineNotFoundError(params.machineId.getValue());
        }
        if (!machine.leaseId) {
            return { machine, assignments: [] };
        }

        const assignments = await this.machinePool.sync(machine.leaseId, machine.fqdn);

        if (assignments === null) {
            const freed = await this.machineRepository.with(params.machineId, (locked) => {
                locked.release();
            });

            return { machine: freed ?? machine, assignments: [] };
        }

        return { machine, assignments };
    }
}
