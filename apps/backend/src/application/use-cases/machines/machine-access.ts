import { Injectable } from "@nestjs/common";

import { CloudAccount } from "../../../domain/entities/cloud-account/cloud-account";
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { Machine } from "../../../domain/entities/machine/machine";
import { MachineId } from "../../../domain/entities/machine/machine-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { MachineRepository } from "../../interfaces/repositories/machine-repository";
import { CloudAccountAccess } from "../cloud-accounts/cloud-account-access";

// The shared front door of every machine scenario: the cloud account's own access check, then the
// machine — which must belong to that account (another account's machine reads as 404).
@Injectable()
export class MachineAccess {
    constructor(
        private readonly cloudAccountAccess: CloudAccountAccess,
        private readonly machineRepository: MachineRepository,
    ) {}

    async authorize(
        creds: { token: string },
        projectHandle: string,
        cloudAccountId: string,
        machineId: string,
        permission: UserPermissionName,
    ): Promise<{ cloudAccount: CloudAccount; machine: Machine }> {
        const { cloudAccount } = await this.cloudAccountAccess.authorize(creds, projectHandle, cloudAccountId, permission);
        const machine = await this.machineRepository.find(MachineId.fromString(machineId));

        if (!machine || machine.cloudAccountId !== cloudAccount.id) {
            throw new NotFoundResourceError(machineId);
        }

        return { cloudAccount, machine };
    }
}
