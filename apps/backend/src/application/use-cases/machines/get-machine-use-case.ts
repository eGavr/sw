import { Injectable } from "@nestjs/common";

import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { MachinePoolGateway } from "../../interfaces/gateways/machine-pool-gateway";

import { MachineAccess } from "./machine-access";
import { MachineView } from "./machine-view";

export type GetMachineInput = {
    readonly creds: { readonly token: string };
    readonly params: {
        readonly projectId: string;
        readonly cloudAccountId: string;
        readonly machineId: string;
    };
};

@Injectable()
export class GetMachineUseCase {
    private readonly permissionName = UserPermissionName.CloudAccount.Get;

    constructor(
        private readonly machineAccess: MachineAccess,
        private readonly machinePool: MachinePoolGateway,
    ) {}

    async execute({ creds, params }: GetMachineInput): Promise<MachineView> {
        const { machine } = await this.machineAccess.authorize(
            creds,
            params.projectId,
            params.cloudAccountId,
            params.machineId,
            this.permissionName,
        );
        const lease = machine.leaseId ? await this.machinePool.describe(machine.leaseId) : null;

        return { machine, lease };
    }
}
