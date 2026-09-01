import { AgentTokenService } from "../../../../application/interfaces/agent-token-service";
import { Environment } from "../../../../domain/entities/environment/environment";
import { VmEnvironmentProviderGateway } from "../vm/vm-environment-provider-gateway";
import { VmProvisioner } from "../vm/vm-provisioner";

import { AndroidEmulatorEnvironmentConfig } from "./android-emulator-environment-config";

// Android emulator adapter: an environment is an on-demand YC Compute VM created from the prebaked golden
// image (Android SDK + emulator + AVDs + Appium + companion + boot unit — see images/android-emulator-node),
// scheduled on a KVM-capable hardware platform because the official QEMU emulator needs /dev/kvm. Like the
// redroid adapter this provisions a whole VM (a managed k8s node cannot expose KVM), and the VM
// self-configures from the metadata passed here (environment id, AVD = Android version, internal callback
// URL/secret) — the adapter never SSHes in. The endpoint is NOT set here: the in-VM agent derives it (the
// VM's private IP) and reports it on registration, exactly like the browser nodes. deprovision deletes the
// VM. Only the YC CLI is provider-specific; the boot infra runs on any host that exposes /dev/kvm.
export class AndroidEmulatorEnvironmentProviderGateway extends VmEnvironmentProviderGateway {
    constructor(
        compute: VmProvisioner,
        private readonly config: AndroidEmulatorEnvironmentConfig,
        private readonly agentTokens: AgentTokenService,
    ) {
        super(compute, config);
    }

    protected async metadataFor(environment: Environment): Promise<Record<string, string>> {
        return {
            "sw-environment-id": environment.id,
            "sw-android-avd": this.config.avdName(environment.platform.version),
            "sw-internal-url": this.config.internalUrl,
            "sw-internal-token": await this.agentTokens.issue(environment.id),
        };
    }
}
