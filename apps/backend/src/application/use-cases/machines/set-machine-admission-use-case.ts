import { Injectable } from "@nestjs/common";

import { Machine } from "../../../domain/entities/machine/machine";
import { MachineAdmission } from "../../../domain/entities/machine/machine-admission";
import { MachineId } from "../../../domain/entities/machine/machine-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { MachineRepository } from "../../interfaces/repositories/machine-repository";

import { MachineAccess } from "./machine-access";

export type SetMachineAdmissionInput = {
    readonly creds: { readonly token: string };
    readonly params: {
        readonly projectId: string;
        readonly cloudAccountId: string;
        readonly machineId: string;
        readonly admission: MachineAdmission;
    };
};

// The operator's intent for a machine: cordon (no new lease), uncordon, or drain (no new lease and
// forgotten once released — a drain of a machine nobody holds is an immediate detach). Null result =
// the machine was drained away right here.
@Injectable()
export class SetMachineAdmissionUseCase {
    private readonly permissionName = UserPermissionName.CloudAccount.Create;

    constructor(
        private readonly machineAccess: MachineAccess,
        private readonly machineRepository: MachineRepository,
    ) {}

    async execute({ creds, params }: SetMachineAdmissionInput): Promise<Machine | null> {
        await this.machineAccess.authorize(creds, params.projectId, params.cloudAccountId, params.machineId, this.permissionName);

        const machineId = MachineId.fromString(params.machineId);
        const machine = await this.machineRepository.with(machineId, (locked) => {
            switch (params.admission) {
                case MachineAdmission.Cordoned:
                    locked.cordon();
                    break;
                case MachineAdmission.Draining:
                    locked.drain();
                    break;
                default:
                    locked.uncordon();
            }
        });

        if (machine?.isDrained()) {
            await this.machineRepository.delete(machineId);

            return null;
        }

        return machine;
    }
}
