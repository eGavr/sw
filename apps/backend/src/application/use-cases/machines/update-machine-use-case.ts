import { Injectable } from "@nestjs/common";

import { Stereotype } from "../../../domain/entities/cloud-account/stereotype";
import { toExecution } from "../../../domain/entities/environment/execution";
import { StereotypeNotProvidedError } from "../../../domain/entities/machine/error/stereotype-not-provided-error";
import { Machine } from "../../../domain/entities/machine/machine";
import { MachineId } from "../../../domain/entities/machine/machine-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { MachineRepository } from "../../interfaces/repositories/machine-repository";

import { MachineAccess } from "./machine-access";

export type UpdateMachineInput = {
    readonly creds: { readonly token: string };
    readonly params: {
        readonly projectId: string;
        readonly cloudAccountId: string;
        readonly machineId: string;
        readonly provides: ReadonlyArray<{ readonly platform: string; readonly execution: string }>;
    };
};

// The operator changes what an attached machine serves — a box that gained docker starts taking browser
// slots too, without being detached and re-attached (which would mean reinstalling its agent). What it
// currently holds is untouched: the pool returns that lease on its own clock.
@Injectable()
export class UpdateMachineUseCase {
    private readonly permissionName = UserPermissionName.CloudAccount.Create;

    constructor(
        private readonly machineAccess: MachineAccess,
        private readonly machineRepository: MachineRepository,
    ) {}

    async execute({ creds, params }: UpdateMachineInput): Promise<Machine | null> {
        const { cloudAccount } = await this.machineAccess.authorize(
            creds,
            params.projectId,
            params.cloudAccountId,
            params.machineId,
            this.permissionName,
        );

        const provides = params.provides.map((requested) => {
            const execution = toExecution(requested.execution);

            if (!cloudAccount.supports(requested.platform, execution)) {
                throw new StereotypeNotProvidedError(requested.platform, requested.execution);
            }

            return new Stereotype(requested.platform, execution);
        });

        return this.machineRepository.with(
            MachineId.fromString(params.machineId),
            (locked) => locked.reprovide(provides),
        );
    }
}
