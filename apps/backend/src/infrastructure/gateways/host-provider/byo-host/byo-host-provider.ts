import {
    CloudReachability,
    OwnershipVerification,
} from "../../../../application/interfaces/gateways/environment-provider-gateway";
import { HostProviderGateway } from "../../../../application/interfaces/gateways/host-provider-gateway";
import { HostTokenService } from "../../../../application/interfaces/host-token-service";
import { PoolHost } from "../../../../domain/entities/host-pool/pool-host";
import { Logger } from "../../../logging/logger";

import { HostAgentLauncher } from "./host-agent-launcher";

export type ByoHostProviderOptions = {
    // When to watch the emulator in a native window (local dev; there is no per-slot VNC yet).
    readonly emulatorWindow?: boolean;
    // Present for the `local` cloud (the machine IS this box): provision starts the agent itself, so
    // the user never copies credentials into a terminal. Absent for a remote BYO host — a human does.
    readonly launcher?: HostAgentLauncher;
};

// A "cloud" of pre-existing machines the operator brings (a dev Mac, a lab box). Nothing is leased or
// returned. For the `local` box the control plane launches the agent itself (see launcher) — same
// zero-ceremony feel as the docker kind. For a remote BYO host, "ordering" means telling the operator
// to start the agent with the printed credentials. Either way it is the same pool, bridge and agent
// protocol as real bare metal — only the lease is a human (or, locally, us).
export class ByoHostProvider extends HostProviderGateway {
    constructor(
        private readonly hostTokens: HostTokenService,
        private readonly internalUrl: string,
        private readonly logger: Logger,
        private readonly options: ByoHostProviderOptions = {},
    ) {
        super();
    }

    async provision(host: PoolHost): Promise<void> {
        const token = await this.hostTokens.issue(host.id);
        const env: Record<string, string> = {
            SW_HOST_ID: host.id,
            SW_HOST_TOKEN: token,
            SW_INTERNAL_URL: this.internalUrl,
            ...(this.options.emulatorWindow ? { SW_EMULATOR_WINDOW: "1" } : {}),
        };

        if (this.options.launcher) {
            this.options.launcher.launch(env);
            this.logger.log(`byo host provider: host ${host.id} ordered — agent started on this machine`);

            return;
        }

        // A remote machine cannot receive boot metadata (it already runs), so the hand-over goes
        // through the operator: start the agent with these credentials and the pool proceeds as usual.
        this.logger.log([
            `byo host provider: host ${host.id} ordered — start the host agent on the machine:`,
            `  SW_HOST_ID=${host.id} \\`,
            `  SW_HOST_TOKEN=${token} \\`,
            `  SW_INTERNAL_URL=${this.internalUrl} \\`,
            "  bash pool-host-agent.sh",
        ].join("\n"));
    }

    // Nothing to return — the machine is the operator's. Forgetting the row is the whole teardown;
    // the agent on the machine gets 404 on its next check-in and self-fences (stops its slots).
    async deprovision(hostId: string): Promise<void> {
        this.logger.log(`byo host provider: host ${hostId} forgotten (the machine itself stays yours)`);
    }

    // No cloud to sweep: a machine here exists only while its row does, so there is nothing leased
    // that the pool could have forgotten.
    async listLeasedHostIds(): Promise<Array<string>> {
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
