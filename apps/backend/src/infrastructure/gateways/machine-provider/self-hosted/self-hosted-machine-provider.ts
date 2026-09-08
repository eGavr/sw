import {
    CloudReachability,
    OwnershipVerification,
} from "../../../../application/interfaces/gateways/environment-provider-gateway";
import {
    MachineProviderConfig,
    MachineProviderGateway,
} from "../../../../application/interfaces/gateways/machine-provider-gateway";
import { ClaimMachineUseCase } from "../../../../application/use-cases/machines/claim-machine-use-case";
import { ListMachineLeaseIdsUseCase } from "../../../../application/use-cases/machines/list-machine-lease-ids-use-case";
import { MeasureHeadroomUseCase } from "../../../../application/use-cases/machines/measure-headroom-use-case";
import { ReleaseMachineUseCase } from "../../../../application/use-cases/machines/release-machine-use-case";
import { Headroom } from "../../../../domain/entities/machine-pool/headroom";
import { MachineLease } from "../../../../domain/entities/machine-pool/machine-lease";
import { ProvisionedMachine } from "../../../../domain/entities/machine-pool/provisioned-machine";
import { accountOf, stereotypeOf } from "../machine-provider-context";

import { NoMachineAvailableError } from "./no-machine-available-error";

// The self-hosted cloud as the pool sees it: an inventory of the user's own attached machines. "Give me
// a machine" takes a free, ready one of the right stereotype; "take it back" frees it for the next
// lease; the headroom is the count of free ones. A bridge into the machine context — it drives that
// context's use cases the way a controller would, one per operation, and holds no logic of its own.
export class SelfHostedMachineProvider extends MachineProviderGateway {
    constructor(
        private readonly claimMachine: ClaimMachineUseCase,
        private readonly releaseMachine: ReleaseMachineUseCase,
        private readonly listLeaseIdsOfMachines: ListMachineLeaseIdsUseCase,
        private readonly measureHeadroom: MeasureHeadroomUseCase,
    ) {
        super();
    }

    async provision(lease: MachineLease): Promise<ProvisionedMachine> {
        const context = lease.providerContext;
        const machine = await this.claimMachine.execute({
            cloudAccountId: accountOf(context),
            stereotype: stereotypeOf(context),
            leaseId: lease.id,
        });

        if (!machine || machine.slotCapacity === null) {
            throw new NoMachineAvailableError(stereotypeOf(context).platformName, stereotypeOf(context).execution);
        }

        return { machineId: machine.id, slotCapacity: machine.slotCapacity };
    }

    async deprovision(leaseId: string): Promise<void> {
        await this.releaseMachine.execute({ leaseId });
    }

    async listLeaseIds(config: MachineProviderConfig): Promise<Array<string>> {
        return this.listLeaseIdsOfMachines.execute({ cloudAccountId: accountOf(config) });
    }

    async headroom(config: MachineProviderConfig): Promise<Headroom> {
        const { count, nextSlotCapacity } = await this.measureHeadroom.execute({
            cloudAccountId: accountOf(config),
            stereotype: stereotypeOf(config),
        });

        return Headroom.of(count, nextSlotCapacity);
    }

    // The user's own machines are reachable by definition of being attached; whether any is READY is a
    // per-machine fact the machines surface shows, not a binding-level probe.
    async checkAccess(): Promise<CloudReachability> {
        return { reachable: true };
    }

    // Running our agent on their machine with a token they generated IS the proof of ownership.
    async verifyOwnership(): Promise<OwnershipVerification> {
        return { verified: true };
    }
}
