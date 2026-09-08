import {
    CloudReachability,
    OwnershipVerification,
} from "../../../../application/interfaces/gateways/environment-provider-gateway";
import { MachineProviderGateway } from "../../../../application/interfaces/gateways/machine-provider-gateway";
import { LeaseTokenService } from "../../../../application/interfaces/lease-token-service";
import { MachineLease } from "../../../../domain/entities/machine-pool/machine-lease";
import { Logger } from "../../../logging/logger";

import { MachineAgentLauncher } from "./machine-agent-launcher";

export type ByoMachineProviderOptions = {
    // When to watch the emulator in a native window (local dev; there is no per-slot VNC yet).
    readonly emulatorWindow?: boolean;
    // Present for the `local` cloud (the machine IS this box): provision starts the agent itself, so
    // the user never copies credentials into a terminal. Absent for a remote BYO host — a human does.
    readonly launcher?: MachineAgentLauncher;
};

// A "cloud" of pre-existing machines the operator brings (a dev Mac, a lab box). Nothing is leased or
// returned. For the `local` box the control plane launches the agent itself (see launcher) — same
// zero-ceremony feel as the docker kind. For a remote BYO host, "ordering" means telling the operator
// to start the agent with the printed credentials. Either way it is the same pool, bridge and agent
// protocol as real bare metal — only the lease is a human (or, locally, us).
export class ByoMachineProvider extends MachineProviderGateway {
    constructor(
        private readonly leaseTokens: LeaseTokenService,
        private readonly internalUrl: string,
        private readonly logger: Logger,
        private readonly options: ByoMachineProviderOptions = {},
    ) {
        super();
    }

    async provision(lease: MachineLease): Promise<void> {
        const token = await this.leaseTokens.issue(lease.id);
        const env: Record<string, string> = {
            SW_LEASE_ID: lease.id,
            SW_LEASE_TOKEN: token,
            SW_INTERNAL_URL: this.internalUrl,
            ...(this.options.emulatorWindow ? { SW_EMULATOR_WINDOW: "1" } : {}),
        };

        if (this.options.launcher) {
            this.options.launcher.launch(env);
            this.logger.log(`byo machine provider: lease ${lease.id} ordered — agent started on this machine`);

            return;
        }

        // A remote machine cannot receive boot metadata (it already runs), so the hand-over goes
        // through the operator: start the agent with these credentials and the pool proceeds as usual.
        this.logger.log([
            `byo machine provider: lease ${lease.id} ordered — start the machine agent on the machine:`,
            `  SW_LEASE_ID=${lease.id} \\`,
            `  SW_LEASE_TOKEN=${token} \\`,
            `  SW_INTERNAL_URL=${this.internalUrl} \\`,
            "  bash machine-agent.sh",
        ].join("\n"));
    }

    // Nothing to return — the machine is the operator's. Forgetting the row is the whole teardown;
    // the agent on the machine gets 404 on its next check-in and self-fences (stops its slots).
    async deprovision(leaseId: string): Promise<void> {
        this.logger.log(`byo machine provider: lease ${leaseId} forgotten (the machine itself stays yours)`);
    }

    // No cloud to sweep: a machine here exists only while its row does, so there is nothing leased
    // that the pool could have forgotten.
    async listLeaseIds(): Promise<Array<string>> {
        return [];
    }

    async checkAccess(): Promise<CloudReachability> {
        return { reachable: true };
    }

    // The operator's own machine — like the local docker kind, there is nothing to prove.
    async verifyOwnership(): Promise<OwnershipVerification> {
        return { verified: true };
    }
}
