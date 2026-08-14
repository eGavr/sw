import { EnvironmentProviderGateway } from "../../../../application/interfaces/gateways/environment-provider-gateway";
import { Environment } from "../../../../domain/entities/environment/environment";
import { YandexComputeClient } from "../yandex-compute/yandex-compute-client";

import { AndroidRedroidEnvironmentConfig } from "./android-redroid-environment-config";

export const androidRedroidProviderValue = "android-redroid";

// Android (redroid) adapter: an environment is an on-demand YC Compute VM created from the prebaked golden
// image (docker + redroid tags + companion + binder + boot unit — see packages/android-node). redroid needs
// binder + privileged on the host kernel, which a managed k8s node cannot give, so unlike the browser
// adapters this provisions a whole VM rather than a container/Pod. The VM self-configures from the metadata
// passed here (environment id, redroid tag = Android version, internal callback URL/secret) — the adapter
// never SSHes in. The endpoint is NOT set here: the in-VM agent derives it (the VM's private IP) and reports
// it on registration, exactly like the browser nodes. deprovision deletes the VM.
export class AndroidRedroidEnvironmentProviderGateway extends EnvironmentProviderGateway {
    constructor(
        private readonly compute: YandexComputeClient,
        private readonly config: AndroidRedroidEnvironmentConfig,
    ) {
        super();
    }

    async provision(environment: Environment): Promise<void> {
        await this.compute.createInstance({
            name: this.instanceName(environment),
            imageId: this.config.imageId,
            zone: this.config.zone,
            subnetId: this.config.subnetId,
            securityGroupId: this.config.securityGroupId,
            cores: this.config.cores,
            memoryGb: this.config.memoryGb,
            diskSizeGb: this.config.diskSizeGb,
            metadata: {
                "sw-environment-id": environment.id,
                "sw-redroid-tag": this.config.redroidTag(environment.platform.version),
                "sw-internal-url": this.config.internalUrl,
                "sw-internal-secret": this.config.internalSecret,
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
