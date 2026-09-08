import { Injectable } from "@nestjs/common";

import { Stereotype } from "../../../domain/entities/cloud-account/stereotype";
import { toExecution } from "../../../domain/entities/environment/execution";
import { FailedPreconditionError } from "../../../domain/entities/error/failed-precondition-error";
import { InvalidArgumentError } from "../../../domain/entities/error/invalid-argument-error";
import { StereotypeNotProvidedError } from "../../../domain/entities/machine/error/stereotype-not-provided-error";
import { Machine } from "../../../domain/entities/machine/machine";
import { MachineOrigin } from "../../../domain/entities/machine/machine-origin";
import { selfHostedCloudType } from "../../../domain/entities/machine/self-hosted-cloud-type";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { MachineRepository } from "../../interfaces/repositories/machine-repository";
import { CloudAccountAccess } from "../cloud-accounts/cloud-account-access";

export type AttachMachineInput = {
    readonly creds: { readonly token: string };
    readonly params: {
        readonly projectId: string;
        readonly cloudAccountId: string;
        readonly fqdn: string;
        // Stereotypes the machine serves; omitted = every platform the cloud is bound to right now.
        readonly provides?: ReadonlyArray<{ readonly platform: string; readonly execution: string }>;
        readonly slotCapacity?: number;
    };
};

// The user adds one of their own machines to their self-hosted cloud. It enters `pending`: nothing runs
// on it until its agent registers with a registration token the user generates next.
@Injectable()
export class AttachMachineUseCase {
    private readonly permissionName = UserPermissionName.CloudAccount.Create;

    constructor(
        private readonly cloudAccountAccess: CloudAccountAccess,
        private readonly machineRepository: MachineRepository,
    ) {}

    async execute({ creds, params }: AttachMachineInput): Promise<Machine> {
        const { cloudAccount } = await this.cloudAccountAccess.authorize(
            creds,
            params.projectId,
            params.cloudAccountId,
            this.permissionName,
        );

        if (cloudAccount.type !== selfHostedCloudType) {
            throw new FailedPreconditionError(`machines can only be attached to a ${selfHostedCloudType} cloud`);
        }

        const provides = params.provides
            ? params.provides.map((requested) => {
                const execution = toExecution(requested.execution);

                if (!cloudAccount.supports(requested.platform, execution)) {
                    throw new StereotypeNotProvidedError(requested.platform, requested.execution);
                }

                return new Stereotype(requested.platform, execution);
            })
            : cloudAccount.computeBindings().map((binding) => binding.stereotype);

        if (provides.length === 0) {
            throw new InvalidArgumentError("machine: the cloud has no platform bound yet; add a platform first");
        }

        const machine = Machine.attach({
            cloudAccountId: cloudAccount.id,
            origin: MachineOrigin.Attached,
            fqdn: params.fqdn,
            provides,
            slotCapacityOverride: params.slotCapacity ?? null,
        });

        await this.machineRepository.create(machine);

        return machine;
    }
}
