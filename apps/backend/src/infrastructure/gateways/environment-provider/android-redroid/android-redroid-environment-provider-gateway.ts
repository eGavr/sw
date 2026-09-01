import { AgentTokenService } from "../../../../application/interfaces/agent-token-service";
import { Environment } from "../../../../domain/entities/environment/environment";
import { VmEnvironmentProviderGateway } from "../vm/vm-environment-provider-gateway";
import { VmProvisioner } from "../vm/vm-provisioner";

import { AndroidRedroidEnvironmentConfig } from "./android-redroid-environment-config";

// Android (redroid) adapter: an environment is an on-demand YC Compute VM created from the prebaked golden
// image (docker + redroid tags + companion + binder + boot unit — see images/android-node). redroid needs
// binder + privileged on the host kernel, which a managed k8s node cannot give, so unlike the browser
// adapters this provisions a whole VM rather than a container/Pod. The VM self-configures from the metadata
// passed here (environment id, redroid tag = Android version, internal callback URL/secret) — the adapter
// never SSHes in. The endpoint is NOT set here: the in-VM agent derives it (the VM's private IP) and reports
// it on registration, exactly like the browser nodes. deprovision deletes the VM.
export class AndroidRedroidEnvironmentProviderGateway extends VmEnvironmentProviderGateway {
    constructor(
        compute: VmProvisioner,
        private readonly config: AndroidRedroidEnvironmentConfig,
        private readonly agentTokens: AgentTokenService,
    ) {
        super(compute, config);
    }

    protected async metadataFor(environment: Environment): Promise<Record<string, string>> {
        return {
            "sw-environment-id": environment.id,
            "sw-redroid-tag": this.config.redroidTag(environment.platform.version),
            "sw-internal-url": this.config.internalUrl,
            "sw-internal-token": await this.agentTokens.issue(environment.id),
        };
    }
}
