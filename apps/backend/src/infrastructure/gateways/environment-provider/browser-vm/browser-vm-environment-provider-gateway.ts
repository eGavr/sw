import { AgentTokenService } from "../../../../application/interfaces/agent-token-service";
import { Environment } from "../../../../domain/entities/environment/environment";
import { VmEnvironmentProviderGateway } from "../vm/vm-environment-provider-gateway";
import { VmProvisioner } from "../vm/vm-provisioner";

import { BrowserVmEnvironmentConfig } from "./browser-vm-environment-config";

// Browser (linux/container on a VM cloud) adapter: an environment is an on-demand Compute VM created from
// the prebaked golden image (docker + the selenium node image + the boot unit — see images/linux-node).
// The VM self-configures from the metadata passed here: its boot unit runs the selenium node container
// with the heartbeat agent injected (agentBootstrap), exactly like the local docker adapter does on the
// operator's machine — same node, same agent, different host. The endpoint is NOT set here: the in-VM
// agent derives it (the VM's private IP) and reports it on registration. deprovision deletes the VM.
export class BrowserVmEnvironmentProviderGateway extends VmEnvironmentProviderGateway {
    constructor(
        compute: VmProvisioner,
        private readonly config: BrowserVmEnvironmentConfig,
        private readonly agentTokens: AgentTokenService,
    ) {
        super(compute, config);
    }

    protected async metadataFor(environment: Environment): Promise<Record<string, string>> {
        return {
            "sw-environment-id": environment.id,
            "sw-node-image": this.config.nodeImage,
            "sw-session-timeout": String(this.config.sessionTimeoutSeconds),
            "sw-internal-url": this.config.internalUrl,
            "sw-internal-token": await this.agentTokens.issue(environment.id),
        };
    }
}
