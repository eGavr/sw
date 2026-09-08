import { Injectable } from "@nestjs/common";

import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { MachinePoolGateway } from "../../interfaces/gateways/machine-pool-gateway";
import { MachineRepository } from "../../interfaces/repositories/machine-repository";
import { CloudAccountAccess } from "../cloud-accounts/cloud-account-access";

import { MachineView } from "./machine-view";

export type ListMachinesInput = {
    readonly creds: { readonly token: string };
    readonly params: {
        readonly projectId: string;
        readonly cloudAccountId: string;
    };
};

@Injectable()
export class ListMachinesUseCase {
    private readonly permissionName = UserPermissionName.CloudAccount.Get;

    constructor(
        private readonly cloudAccountAccess: CloudAccountAccess,
        private readonly machineRepository: MachineRepository,
        private readonly machinePool: MachinePoolGateway,
    ) {}

    async execute({ creds, params }: ListMachinesInput): Promise<Array<MachineView>> {
        const { cloudAccount } = await this.cloudAccountAccess.authorize(
            creds,
            params.projectId,
            params.cloudAccountId,
            this.permissionName,
        );
        const machines = await this.machineRepository.listByCloudAccount(cloudAccount.id);

        return Promise.all(machines.map(async (machine) => ({
            machine,
            lease: machine.leaseId ? await this.machinePool.describe(machine.leaseId) : null,
        })));
    }
}
