import {
    CloudReachability,
    OwnershipVerification,
} from "../../../../application/interfaces/gateways/environment-provider-gateway";
import {
    MachineProviderConfig,
    MachineProviderGateway,
} from "../../../../application/interfaces/gateways/machine-provider-gateway";
import { LeaseTokenService } from "../../../../application/interfaces/lease-token-service";
import { MachineLease } from "../../../../domain/entities/machine-pool/machine-lease";

import { YandexBaremetalClient } from "./yandex-baremetal-client";
import { baremetalBindingConfig, YandexBaremetalShape } from "./yandex-baremetal-config";

// The label every leased machine carries — the orphan sweep's handle: a server labelled ours that no
// pool row knows about is a leak, and leaked metal costs real money.
export const hostIdLabel = "sw-lease-id";

// Leases whole BareMetal servers for the machine pool in the binding's folder (delegated BYOC — the
// user's machine, the user's bill). The machine self-configures from its boot metadata: the golden
// image's bootstrap reads /etc/sw/host.env, fetches the host agent from the control plane and starts
// polling for its desired slots — this adapter never SSHes in.
export class YandexBaremetalMachineProvider extends MachineProviderGateway {
    constructor(
        private readonly baremetal: YandexBaremetalClient,
        private readonly shape: YandexBaremetalShape,
        private readonly leaseTokens: LeaseTokenService,
    ) {
        super();
    }

    async provision(lease: MachineLease): Promise<void> {
        await this.baremetal.createServer({
            name: serverNameFor(lease.id),
            folderId: baremetalBindingConfig(lease.providerContext).folderId,
            configurationId: this.shape.configurationId,
            zone: this.shape.zone,
            subnetId: this.shape.subnetId,
            labels: { [hostIdLabel]: lease.id },
            userData: await this.bootUserData(lease),
        });
    }

    async deprovision(leaseId: string, config: MachineProviderConfig): Promise<void> {
        // Return it in the same folder it was leased in, or the user's machine leaks (and keeps
        // costing them) — that is exactly what the stored whereabouts preserve.
        await this.baremetal.deleteServer(
            serverNameFor(leaseId),
            baremetalBindingConfig(config).folderId,
        );
    }

    async listLeaseIds(config: MachineProviderConfig): Promise<Array<string>> {
        const servers = await this.baremetal.listServers(baremetalBindingConfig(config).folderId);

        return servers
            .map((server) => server.labels?.[hostIdLabel])
            .filter((id): id is string => typeof id === "string" && id.length > 0);
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
    // sources /etc/sw/host.env and dials the control plane — nothing else is negotiated.
    private async bootUserData(lease: MachineLease): Promise<string> {
        const token = await this.leaseTokens.issue(lease.id);

        return [
            "#cloud-config",
            "write_files:",
            "  - path: /etc/sw/lease.env",
            "    permissions: \"0600\"",
            "    content: |",
            `      SW_LEASE_ID=${lease.id}`,
            `      SW_INTERNAL_URL=${this.shape.internalUrl}`,
            `      SW_LEASE_TOKEN=${token}`,
        ].join("\n");
    }
}

// A DNS-label-safe, per-host-unique server name; order and return address the same machine by it.
function serverNameFor(leaseId: string): string {
    return `sw-lease-${leaseId}`;
}
