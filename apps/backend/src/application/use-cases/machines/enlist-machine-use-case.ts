import { Injectable } from "@nestjs/common";

import { Stereotype } from "../../../domain/entities/cloud-account/stereotype";
import { Machine } from "../../../domain/entities/machine/machine";
import { MachineId } from "../../../domain/entities/machine/machine-id";
import { MachineOrigin } from "../../../domain/entities/machine/machine-origin";
import { RegistrationTokenService } from "../../interfaces/registration-token-service";
import { MachineRepository } from "../../interfaces/repositories/machine-repository";

export type EnlistMachineParams = {
    readonly cloudAccountId: string;
    readonly provides: ReadonlyArray<Stereotype>;
    readonly leaseId: string;
    readonly slotCapacity: number;
};

export type EnlistedMachine = {
    readonly machine: Machine;
    readonly registrationToken: string;
};

// A machine WE ordered from a cloud for a lease enters the inventory before it even boots: claimed from
// birth by that lease, with a registration token its boot metadata carries. It registers like any other
// machine and is discarded with its lease.
@Injectable()
export class EnlistMachineUseCase {
    constructor(
        private readonly machineRepository: MachineRepository,
        private readonly registrationTokens: RegistrationTokenService,
    ) {}

    async execute(params: EnlistMachineParams): Promise<EnlistedMachine> {
        const existing = await this.machineRepository.findByLease(params.leaseId);
        const minted = this.registrationTokens.mint();
        const expiresAt = new Date(Date.now() + orderedMachineRegistrationTtlMs);

        if (existing) {
            await this.machineRepository.with(MachineId.fromString(existing.id), (locked) => {
                locked.expectRegistration(minted.hash, expiresAt);
            });

            return { machine: existing, registrationToken: minted.token };
        }

        const machine = Machine.attach({
            cloudAccountId: params.cloudAccountId,
            origin: MachineOrigin.Ordered,
            fqdn: null,
            provides: params.provides,
            slotCapacityOverride: params.slotCapacity,
            leaseId: params.leaseId,
        });

        machine.expectRegistration(minted.hash, expiresAt);
        await this.machineRepository.create(machine);

        return { machine, registrationToken: minted.token };
    }
}

// A leased server takes minutes to hand over, sometimes an hour; the token outlives the pool's own
// ordering timeout so the order never fails on the token before the pool gives up on the machine.
const orderedMachineRegistrationTtlMs = 3 * 60 * 60 * 1000;
