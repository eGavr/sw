import { Injectable } from "@nestjs/common";

import { MachineNotFoundError } from "../../../domain/entities/machine/error/machine-not-found-error";
import { Machine } from "../../../domain/entities/machine/machine";
import { MachineFacts, MachineFactsData } from "../../../domain/entities/machine/machine-facts";
import { MachineId } from "../../../domain/entities/machine/machine-id";
import { SlotCapacityPolicy } from "../../../domain/entities/machine/slot-capacity-policy";
import { RegistrationTokenService } from "../../interfaces/registration-token-service";
import { MachineRepository } from "../../interfaces/repositories/machine-repository";

export type RegisterMachineParams = {
    readonly machineId: MachineId;
    readonly registrationToken: string;
    readonly facts: MachineFactsData;
};

// The machine agent's first contact: spends the registration token from the install command and brings
// the machine online with its first facts. The caller mints the long-lived machine token on success.
@Injectable()
export class RegisterMachineUseCase {
    constructor(
        private readonly machineRepository: MachineRepository,
        private readonly registrationTokens: RegistrationTokenService,
        private readonly slotCapacityPolicy: SlotCapacityPolicy,
    ) {}

    async execute(params: RegisterMachineParams): Promise<Machine> {
        const now = new Date();
        const hash = this.registrationTokens.hash(params.registrationToken);
        const facts = MachineFacts.fromObject(params.facts);
        const machine = await this.machineRepository.with(params.machineId, (locked) => {
            locked.register(hash, facts, now, this.slotCapacityPolicy);
        });

        if (!machine) {
            throw new MachineNotFoundError(params.machineId.getValue());
        }

        return machine;
    }
}
