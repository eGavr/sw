import {
    CloudReachability,
    OwnershipVerification,
} from "../../../../application/interfaces/gateways/environment-provider-gateway";
import {
    MachineProviderConfig,
    MachineProviderGateway,
} from "../../../../application/interfaces/gateways/machine-provider-gateway";
import { DiscardMachineUseCase } from "../../../../application/use-cases/machines/discard-machine-use-case";
import { EnlistMachineUseCase } from "../../../../application/use-cases/machines/enlist-machine-use-case";
import { Headroom } from "../../../../domain/entities/machine-pool/headroom";
import { MachineLease } from "../../../../domain/entities/machine-pool/machine-lease";
import { ProvisionedMachine } from "../../../../domain/entities/machine-pool/provisioned-machine";
import { accountOf, stereotypeOf } from "../machine-provider-context";

import { YandexBaremetalClient } from "./yandex-baremetal-client";
import { baremetalBindingConfig, YandexBaremetalShape } from "./yandex-baremetal-config";

// The label every leased server carries — the orphan sweep's handle: a server labelled ours that no
// pool row knows about is a leak, and leaked metal costs real money.
export const leaseIdLabel = "sw-lease-id";

// Leases whole BareMetal servers for the machine pool in the binding's folder (delegated BYOC — the
// user's machine, the user's bill). The server enters the machine inventory before it boots (claimed
// by its lease from birth) and self-configures from its boot metadata: the golden image's bootstrap
// reads /etc/sw/machine.env and runs the installer, which registers the machine with the control
// plane — this adapter never SSHes in.
export class YandexBaremetalMachineProvider extends MachineProviderGateway {
    constructor(
        private readonly baremetal: YandexBaremetalClient,
        private readonly shape: YandexBaremetalShape,
        private readonly enlistMachine: EnlistMachineUseCase,
        private readonly discardMachine: DiscardMachineUseCase,
    ) {
        super();
    }

    async provision(lease: MachineLease): Promise<ProvisionedMachine> {
        const context = lease.providerContext;
        const { machine, registrationToken } = await this.enlistMachine.execute({
            cloudAccountId: accountOf(context),
            provides: [stereotypeOf(context)],
            leaseId: lease.id,
            slotCapacity: this.shape.slotsPerMachine,
        });

        await this.baremetal.createServer({
            name: serverNameFor(lease.id),
            folderId: baremetalBindingConfig(context).folderId,
            configurationId: this.shape.configurationId,
            zone: this.shape.zone,
            subnetId: this.shape.subnetId,
            labels: { [leaseIdLabel]: lease.id },
            userData: this.bootUserData(machine.id, registrationToken),
        });

        return { machineId: machine.id, slotCapacity: this.shape.slotsPerMachine };
    }

    async deprovision(leaseId: string, config: MachineProviderConfig): Promise<void> {
        // Return it in the same folder it was leased in, or the user's machine leaks (and keeps
        // costing them) — that is exactly what the stored whereabouts preserve.
        await this.baremetal.deleteServer(serverNameFor(leaseId), baremetalBindingConfig(config).folderId);
        await this.discardMachine.execute({ leaseId });
    }

    async listLeaseIds(config: MachineProviderConfig): Promise<Array<string>> {
        const servers = await this.baremetal.listServers(baremetalBindingConfig(config).folderId);

        return servers
            .map((server) => server.labels?.[leaseIdLabel])
            .filter((id): id is string => typeof id === "string" && id.length > 0);
    }

    // A public cloud hands out as many servers as we order; the pool's own cap is the limit.
    async headroom(): Promise<Headroom> {
        return Headroom.unbounded();
    }

    // The folder's owner authorises the project by placing its marker label on the folder; we read it
    // (resource-manager.viewer, which cannot write it), so naming someone else's folder proves nothing.
    async verifyOwnership(config: MachineProviderConfig, markerKey: string): Promise<OwnershipVerification> {
        const { folderId } = baremetalBindingConfig(config);

        if (!folderId) {
            return { verified: false, detail: "no folder configured on the binding" };
        }

        try {
            const labels = await this.baremetal.folderLabels(folderId);

            return Object.prototype.hasOwnProperty.call(labels, markerKey)
                ? { verified: true }
                : { verified: false, detail: `folder ${folderId} is missing the ownership label ${markerKey}` };
        } catch (error) {
            return { verified: false, detail: error instanceof Error ? error.message : String(error) };
        }
    }

    async checkAccess(config: MachineProviderConfig): Promise<CloudReachability> {
        return this.baremetal.checkAccess(baremetalBindingConfig(config).folderId);
    }

    // cloud-init user-data: the whole hand-over to the machine. The golden image's bootstrap unit
    // sources /etc/sw/machine.env and runs the installer, which registers with the one-time token.
    private bootUserData(machineId: string, registrationToken: string): string {
        return [
            "#cloud-config",
            "write_files:",
            "  - path: /etc/sw/machine.env",
            "    permissions: \"0600\"",
            "    content: |",
            `      SW_MACHINE_ID=${machineId}`,
            `      SW_INTERNAL_URL=${this.shape.internalUrl}`,
            `      SW_REGISTRATION_TOKEN=${registrationToken}`,
        ].join("\n");
    }
}

// A DNS-label-safe, per-lease-unique server name; order and return address the same machine by it.
function serverNameFor(leaseId: string): string {
    return `sw-lease-${leaseId}`;
}
