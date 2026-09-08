import {
    CloudReachability,
    EnvironmentProviderGateway,
    OwnershipVerification,
} from "../../../../application/interfaces/gateways/environment-provider-gateway";
import { MachineProviderGateway } from "../../../../application/interfaces/gateways/machine-provider-gateway";
import { PlaceWorkloadUseCase } from "../../../../application/use-cases/machine-pool/place-workload-use-case";
import { ReleaseWorkloadUseCase } from "../../../../application/use-cases/machine-pool/release-workload-use-case";
import { CloudAccount } from "../../../../domain/entities/cloud-account/cloud-account";
import { ComputeBinding } from "../../../../domain/entities/cloud-account/compute-binding";
import { Environment } from "../../../../domain/entities/environment/environment";
import { EnvironmentId } from "../../../../domain/entities/environment/environment-id";
import {
    EnvironmentQuota,
    EnvironmentQuotaPolicy,
} from "../../../../domain/entities/environment/environment-quota";
import { InternalError } from "../../../../domain/entities/error/internal-error";
import { MachinePoolKey } from "../../../../domain/entities/machine-pool/machine-pool-key";
import { OwnershipMarker } from "../../../../domain/entities/verification/ownership-marker";
import { machineProviderCloudKey } from "../../machine-provider/routing-machine-provider-gateway";

import { MachinePoolEnvironmentConfig } from "./machine-pool-environment-config";

// The bridge between the environment context and the machine pool: to the routing gateway this is one
// more compute adapter (the `baremetal` kind); inside, it drives the pool's use cases the way a
// controller would — the pool is an embedded external system, not a sibling repository. Provisioning
// = seating the environment somewhere in the binding's pool; the machines' own lifecycle (ordering,
// idle return) belongs to the pool and never shows here.
export class MachinePoolEnvironmentProviderGateway extends EnvironmentProviderGateway {
    constructor(
        private readonly placeWorkload: PlaceWorkloadUseCase,
        private readonly releaseWorkload: ReleaseWorkloadUseCase,
        private readonly machineProvider: MachineProviderGateway,
        private readonly config: MachinePoolEnvironmentConfig,
        private readonly quotaPolicy: EnvironmentQuotaPolicy,
    ) {
        super();
    }

    async provision(environment: Environment, cloudAccount: CloudAccount | null): Promise<void> {
        const { cloudAccount: account, binding } = this.boundBinding(environment, cloudAccount);

        // The machine budget derives from the binding's environment quota: enough machines to seat
        // every environment the quota admits, not one more — the quota is the single spend knob.
        const quota = EnvironmentQuota.fromBindingConfig(binding.config, this.quotaPolicy);

        await this.placeWorkload.execute({
            environmentId: EnvironmentId.fromString(environment.id),
            poolKey: new MachinePoolKey(account.id, binding.id),
            slotCapacity: this.config.slotsPerMachine,
            maxHosts: Math.ceil(quota.limit / this.config.slotsPerMachine),
            providerContext: this.withCloud(binding.config, account),
            launch: {
                avd: this.config.avdName(environment.platform.version),
                // The device kind the slot dresses the AVD as (an emulator device definition by id).
                device: environment.platform.deviceModel,
                internalUrl: this.config.internalUrl,
                sessionTimeoutSeconds: this.config.sessionTimeoutSeconds,
                // What the slot handles per application: pull and install the build's artifact, and
                // stage its paired webdriver for Appium — either may be absent (a preinstalled app has
                // nothing to install, a native app nothing to drive); every application is listed so
                // the slot detects what the image ships under a preinstalled word too.
                apps: environment.applications.toArray()
                    .map((application) => ({
                        name: application.nameAlias,
                        app: Boolean(application.source?.appRef),
                        webdriver: Boolean(application.source?.webdriverRef),
                    })),
            },
        });
    }

    async deprovision(environment: Environment): Promise<void> {
        await this.releaseWorkload.execute({ environmentId: EnvironmentId.fromString(environment.id) });
    }

    async checkAccess(cloudAccount: CloudAccount, binding: ComputeBinding): Promise<CloudReachability> {
        return this.machineProvider.checkAccess(this.withCloud(binding.config, cloudAccount));
    }

    // The bridge only names the project's marker; HOW ownership is proven is the host provider's
    // business (a folder label on a delegated cloud, nothing at all on the operator's own machine).
    async verifyOwnership(cloudAccount: CloudAccount, binding: ComputeBinding): Promise<OwnershipVerification> {
        const markerKey = OwnershipMarker.forProject(cloudAccount.projectId.getValue()).value();

        return this.machineProvider.verifyOwnership(this.withCloud(binding.config, cloudAccount), markerKey);
    }

    // Every provider-bound call carries the account's cloud type inside the otherwise-opaque config —
    // the machines-source key. Host rows inherit it in providerContext from birth, so return and
    // orphan sweep always know a machine's cloud even after the binding is gone.
    private withCloud(config: Record<string, unknown>, cloudAccount: CloudAccount): Record<string, unknown> {
        return { ...config, [machineProviderCloudKey]: cloudAccount.type };
    }

    // A pooled assignment is keyed by the binding: without it there is no pool to seat the environment
    // in. The routing gateway only sends environments stamped with this kind here, so a missing
    // binding is a wiring defect, not a user error.
    private boundBinding(
        environment: Environment,
        cloudAccount: CloudAccount | null,
    ): { cloudAccount: CloudAccount; binding: ComputeBinding } {
        const binding = cloudAccount?.computeBindingFor(environment.platform.name, environment.execution);

        if (!cloudAccount || !binding) {
            throw new InternalError(`environment ${environment.id}: no compute binding for its machine pool`);
        }

        return { cloudAccount, binding };
    }
}
