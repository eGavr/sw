import {
    CloudReachability,
    OwnershipVerification,
} from "../../../../application/interfaces/gateways/environment-provider-gateway";
import { HostProviderGateway } from "../../../../application/interfaces/gateways/host-provider-gateway";
import { HostTokenService } from "../../../../application/interfaces/host-token-service";
import { PoolHost } from "../../../../domain/entities/host-pool/pool-host";
import { Logger } from "../../../logging/logger";

// A "cloud" of exactly one pre-existing machine — the operator's own (a dev Mac, a lab box). Nothing
// is leased or returned: "ordering" a machine means telling the operator to start the host agent on
// it with the printed credentials; the ordering timeout gives them plenty of time. This is the same
// pool, bridge and agent protocol as real bare metal — only the lease is a human.
export class ByoHostProvider extends HostProviderGateway {
    constructor(
        private readonly hostTokens: HostTokenService,
        private readonly internalUrl: string,
        private readonly logger: Logger,
    ) {
        super();
    }

    async provision(host: PoolHost): Promise<void> {
        const token = await this.hostTokens.issue(host.id);

        // The machine cannot receive boot metadata (it already runs), so the hand-over goes through
        // the operator: start the agent with these credentials and the pool proceeds as usual.
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
