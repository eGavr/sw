import { AgentTokenService } from "../../../../application/interfaces/agent-token-service";
import { EnvironmentProviderGateway } from "../../../../application/interfaces/gateways/environment-provider-gateway";
import { Environment } from "../../../../domain/entities/environment/environment";
import { YandexComputeClient } from "../yandex-compute/yandex-compute-client";

import { AndroidEmulatorEnvironmentConfig } from "./android-emulator-environment-config";

export const androidEmulatorProviderValue = "android-emulator";

// Android emulator adapter: an environment is an on-demand YC Compute VM created from the prebaked golden
// image (Android SDK + emulator + AVDs + Appium + companion + boot unit — see packages/android-emulator-node),
// scheduled on a KVM-capable hardware platform because the official QEMU emulator needs /dev/kvm. Like the
// redroid adapter this provisions a whole VM (a managed k8s node cannot expose KVM), and the VM
// self-configures from the metadata passed here (environment id, AVD = Android version, internal callback
// URL/secret) — the adapter never SSHes in. The endpoint is NOT set here: the in-VM agent derives it (the
// VM's private IP) and reports it on registration, exactly like the browser nodes. deprovision deletes the
// VM. Only the YC CLI is provider-specific; the boot infra runs on any host that exposes /dev/kvm.
export class AndroidEmulatorEnvironmentProviderGateway extends EnvironmentProviderGateway {
    constructor(
        private readonly compute: YandexComputeClient,
        private readonly config: AndroidEmulatorEnvironmentConfig,
        private readonly agentTokens: AgentTokenService,
    ) {
        super();
    }

    async provision(environment: Environment): Promise<void> {
        await this.compute.createInstance({
            name: this.instanceName(environment),
            imageId: this.config.imageId,
            platformId: this.config.platformId,
            zone: this.config.zone,
            subnetId: this.config.subnetId,
            securityGroupId: this.config.securityGroupId,
            cores: this.config.cores,
            memoryGb: this.config.memoryGb,
            diskSizeGb: this.config.diskSizeGb,
            metadata: {
                "sw-environment-id": environment.id,
                "sw-android-avd": this.config.avdName(environment.platform.version),
                "sw-internal-url": this.config.internalUrl,
                "sw-internal-token": await this.agentTokens.issue(environment.id),
            },
        });
    }

    async deprovision(environment: Environment): Promise<void> {
        await this.compute.deleteInstance(this.instanceName(environment));
    }

    // A YC instance name is a DNS label; the environment id is a lowercase uuid, so `sw-env-<uuid>` is a
    // valid, per-environment-unique name — provision and deprovision address the same VM by it.
    private instanceName(environment: Environment): string {
        return `sw-env-${environment.id}`;
    }
}
