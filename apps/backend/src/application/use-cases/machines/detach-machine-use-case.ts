import { Injectable } from "@nestjs/common";

import { MachineLeasedError } from "../../../domain/entities/machine/error/machine-leased-error";
import { MachineId } from "../../../domain/entities/machine/machine-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { MachineRepository } from "../../interfaces/repositories/machine-repository";

import { MachineAccess } from "./machine-access";

export type DetachMachineInput = {
    readonly creds: { readonly token: string };
    readonly params: {
        readonly projectId: string;
        readonly cloudAccountId: string;
        readonly machineId: string;
        // Forget the machine even while the pool holds it: its environments die with their slots and
        // the pool writes the lease off on its own clock. Without it a leased machine must be drained first.
        readonly force: boolean;
    };
};

// The user removes a machine from their cloud. The row goes; the agent on the box learns it on its next
// sync (404) and stops every slot it runs.
@Injectable()
export class DetachMachineUseCase {
    private readonly permissionName = UserPermissionName.CloudAccount.Delete;

    constructor(
        private readonly machineAccess: MachineAccess,
        private readonly machineRepository: MachineRepository,
    ) {}

    async execute({ creds, params }: DetachMachineInput): Promise<void> {
        const { machine } = await this.machineAccess.authorize(
            creds,
            params.projectId,
            params.cloudAccountId,
            params.machineId,
            this.permissionName,
        );

        if (machine.leaseId && !params.force) {
            throw new MachineLeasedError(machine.id);
        }

        await this.machineRepository.delete(MachineId.fromString(machine.id));
    }
}
