import { AgentTokenService } from "../../../../application/interfaces/agent-token-service";
import {
    CloudReachability,
    EnvironmentProviderGateway,
} from "../../../../application/interfaces/gateways/environment-provider-gateway";
import { CloudAccount } from "../../../../domain/entities/cloud-account/cloud-account";
import { Environment } from "../../../../domain/entities/environment/environment";
import { androidProvisioningOverrides } from "../android-provider-config";
import { VmProvisioner } from "../vm/vm-provisioner";

import { AndroidRedroidEnvironmentConfig } from "./android-redroid-environment-config";

// Android (redroid) adapter: an environment is an on-demand YC Compute VM created from the prebaked golden
// image (docker + redroid tags + companion + binder + boot unit — see images/android-node). redroid needs
// binder + privileged on the host kernel, which a managed k8s node cannot give, so unlike the browser
// adapters this provisions a whole VM rather than a container/Pod. The VM self-configures from the metadata
// passed here (environment id, redroid tag = Android version, internal callback URL/secret) — the adapter
// never SSHes in. The endpoint is NOT set here: the in-VM agent derives it (the VM's private IP) and reports
// it on registration, exactly like the browser nodes. deprovision deletes the VM.
export class AndroidRedroidEnvironmentProviderGateway extends EnvironmentProviderGateway {
    constructor(
        private readonly compute: VmProvisioner,
        private readonly config: AndroidRedroidEnvironmentConfig,
        private readonly agentTokens: AgentTokenService,
    ) {
        super();
    }

    async provision(environment: Environment, cloudAccount: CloudAccount | null): Promise<void> {
        // The cloud account's config points provisioning at the user's own folder/network/image (delegated
        // BYOC); absent keys fall back to the install defaults (the operator's folder).
        const overrides = androidProvisioningOverrides(cloudAccount?.config);

        await this.compute.createInstance({
            name: this.instanceName(environment),
            folderId: overrides.folderId,
            imageId: overrides.imageId ?? this.config.imageId,
            zone: overrides.zone ?? this.config.zone,
            subnetId: overrides.subnetId ?? this.config.subnetId,
            securityGroupId: overrides.securityGroupId ?? this.config.securityGroupId,
            cores: this.config.cores,
            memoryGb: this.config.memoryGb,
            diskSizeGb: this.config.diskSizeGb,
            metadata: {
                "sw-environment-id": environment.id,
                "sw-redroid-tag": this.config.redroidTag(environment.platform.version),
                "sw-internal-url": this.config.internalUrl,
                "sw-internal-token": await this.agentTokens.issue(environment.id),
            },
        });
    }

    async deprovision(environment: Environment, cloudAccount: CloudAccount | null): Promise<void> {
        // Delete in the same folder we created it in, or the user's VM leaks (and keeps costing them).
        await this.compute.deleteInstance(
            this.instanceName(environment),
            androidProvisioningOverrides(cloudAccount?.config).folderId,
        );
    }

    async checkAccess(cloudAccount: CloudAccount): Promise<CloudReachability> {
        return this.compute.checkAccess(androidProvisioningOverrides(cloudAccount.config).folderId);
    }

    // A YC instance name is a DNS label; the environment id is a lowercase uuid, so `sw-env-<uuid>` is a
    // valid, per-environment-unique name — provision and deprovision address the same VM by it.
    private instanceName(environment: Environment): string {
        return `sw-env-${environment.id}`;
    }
}
