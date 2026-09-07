import { AgentTokenService } from "../../../../application/interfaces/agent-token-service";
import { Environment } from "../../../../domain/entities/environment/environment";
import { linuxNodeProvisioning } from "../linux-node";
import { VmEnvironmentProviderGateway } from "../vm/vm-environment-provider-gateway";
import { VmProvisioner } from "../vm/vm-provisioner";

import { BrowserVmEnvironmentConfig } from "./browser-vm-environment-config";

// Browser (ubuntu/container on a VM cloud) adapter: an environment is an on-demand Compute VM created from
// the prebaked golden image (docker + the linux base image + the boot unit — see images/linux-node).
// The VM self-configures from the metadata passed here: its boot unit runs the base image with the
// heartbeat agent injected (agentBootstrap) and the node script's parameters as container env, exactly
// like the local docker adapter does on the operator's machine — same node, same agent, different host.
// The endpoint is NOT set here: the in-VM agent derives it (the VM's private IP) and reports it on
// registration. deprovision deletes the VM.
export class BrowserVmEnvironmentProviderGateway extends VmEnvironmentProviderGateway {
    constructor(
        compute: VmProvisioner,
        private readonly config: BrowserVmEnvironmentConfig,
        private readonly agentTokens: AgentTokenService,
    ) {
        super(compute, config);
    }

    protected async metadataFor(environment: Environment): Promise<Record<string, string>> {
        const node = linuxNodeProvisioning({
            platform: environment.platform.toObject(),
            applications: environment.applications.toArray(),
            baseImage: this.config.baseImage,
            sessionTimeoutSeconds: this.config.sessionTimeoutSeconds,
            screen: this.config.screen,
        });

        return {
            "sw-environment-id": environment.id,
            "sw-base-image": node.image,
            // The node script's parameters, handed to the container by the boot unit as env.
            "sw-apps": node.env.SW_APPS,
            "sw-detected-apps-file": node.env.SW_DETECTED_APPS_FILE,
            "sw-idle-timeout": node.env.SW_SESSION_IDLE_TIMEOUT_SECONDS,
            "sw-screen-width": node.env.SW_SCREEN_WIDTH,
            "sw-screen-height": node.env.SW_SCREEN_HEIGHT,
            "sw-internal-url": this.config.internalUrl,
            "sw-internal-token": await this.agentTokens.issue(environment.id),
        };
    }
}
