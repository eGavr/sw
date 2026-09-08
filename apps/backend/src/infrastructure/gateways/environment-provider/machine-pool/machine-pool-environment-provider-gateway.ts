import {
    CloudReachability,
    EnvironmentProviderGateway,
    OwnershipVerification,
} from "../../../../application/interfaces/gateways/environment-provider-gateway";
import { MachineProviderGateway } from "../../../../application/interfaces/gateways/machine-provider-gateway";
import {
    PlaceWorkloadParams,
    PlaceWorkloadUseCase,
} from "../../../../application/use-cases/machine-pool/place-workload-use-case";
import { ReleaseWorkloadUseCase } from "../../../../application/use-cases/machine-pool/release-workload-use-case";
import { CloudAccount } from "../../../../domain/entities/cloud-account/cloud-account";
import { ComputeBinding } from "../../../../domain/entities/cloud-account/compute-binding";
import { Environment } from "../../../../domain/entities/environment/environment";
import { EnvironmentId } from "../../../../domain/entities/environment/environment-id";
import {
    EnvironmentQuota,
    EnvironmentQuotaPolicy,
} from "../../../../domain/entities/environment/environment-quota";
import { Execution } from "../../../../domain/entities/environment/execution";
import { InternalError } from "../../../../domain/entities/error/internal-error";
import { MachinePoolKey } from "../../../../domain/entities/machine-pool/machine-pool-key";
import { WorkloadLaunch } from "../../../../domain/entities/machine-pool/slot-assignment";
import { OwnershipMarker } from "../../../../domain/entities/verification/ownership-marker";
import { stampProviderContext } from "../../machine-provider/machine-provider-context";
import { agentBootstrap, linuxNodeEntrypoint, sessionLogFile } from "../agent-bootstrap";
import { linuxNodeProvisioning } from "../linux-node";

import { MachinePoolEnvironmentConfig } from "./machine-pool-environment-config";

// The slot kinds the machine agent's launcher dispatches on — the one word both sides agree upon.
export const emulatorSlotKind = "emulator";
export const containerSlotKind = "container";

// The bridge between the environment context and the machine pool: to the routing gateway this is one
// more compute adapter (the `baremetal` kind); inside, it drives the pool's use cases the way a
// controller would — the pool is an embedded external system, not a sibling repository. Reserving =
// seating the environment somewhere in the binding's pool, synchronously; provisioning = getting the
// seat's machine; the machines' own lifecycle (ordering, idle return) belongs to the pool and never
// shows here.
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

    async reserve(environment: Environment, cloudAccount: CloudAccount | null): Promise<void> {
        await this.placeWorkload.seat(this.placement(environment, cloudAccount));
    }

    async provision(environment: Environment, cloudAccount: CloudAccount | null): Promise<void> {
        await this.placeWorkload.execute(this.placement(environment, cloudAccount));
    }

    async deprovision(environment: Environment): Promise<void> {
        await this.releaseWorkload.execute({ environmentId: EnvironmentId.fromString(environment.id) });
    }

    async checkAccess(cloudAccount: CloudAccount, binding: ComputeBinding): Promise<CloudReachability> {
        return this.machineProvider.checkAccess(this.context(cloudAccount, binding));
    }

    // The bridge only names the project's marker; HOW ownership is proven is the machine provider's
    // business (a folder label on a delegated cloud, the user's own agent on their own machine).
    async verifyOwnership(cloudAccount: CloudAccount, binding: ComputeBinding): Promise<OwnershipVerification> {
        const markerKey = OwnershipMarker.forProject(cloudAccount.projectId.getValue()).value();

        return this.machineProvider.verifyOwnership(this.context(cloudAccount, binding), markerKey);
    }

    private placement(environment: Environment, cloudAccount: CloudAccount | null): PlaceWorkloadParams {
        const { cloudAccount: account, binding } = this.boundBinding(environment, cloudAccount);
        // The machine budget derives from the binding's environment quota: enough machines to seat
        // every environment the quota admits, not one more — the quota is the single spend knob.
        const quota = EnvironmentQuota.fromBindingConfig(binding.config, this.quotaPolicy);

        return {
            environmentId: EnvironmentId.fromString(environment.id),
            poolKey: new MachinePoolKey(account.id, binding.id),
            slotCapacity: this.config.slotsPerMachine,
            maxLeases: Math.ceil(quota.limit / this.config.slotsPerMachine),
            providerContext: this.context(account, binding),
            launch: this.launch(environment),
        };
    }

    // What the machine's slot launcher must start. The pool carries it verbatim, so the substrate the
    // environment asked for is decided here, once: an emulator instance of a baked AVD, or a container
    // of the linux base image — the same shape our own docker adapter runs, executed by the machine's
    // docker instead of ours.
    private launch(environment: Environment): WorkloadLaunch {
        return environment.execution === Execution.Emulator
            ? this.emulatorLaunch(environment)
            : this.containerLaunch(environment);
    }

    private emulatorLaunch(environment: Environment): WorkloadLaunch {
        return {
            kind: emulatorSlotKind,
            avd: this.config.avdName(environment.platform.version),
            // The device kind the slot dresses the AVD as (an emulator device definition by id).
            device: environment.platform.deviceModel,
            internalUrl: this.config.internalUrl,
            sessionTimeoutSeconds: this.config.sessionTimeoutSeconds,
            // What the slot handles per application: pull and install the build's artifact, and stage
            // its paired webdriver for Appium — either may be absent (a preinstalled app has nothing to
            // install, a native app nothing to drive); every application is listed so the slot detects
            // what the image ships under a preinstalled word too.
            apps: environment.applications.toArray()
                .map((application) => ({
                    name: application.nameAlias,
                    app: Boolean(application.source?.appRef),
                    webdriver: Boolean(application.source?.webdriverRef),
                })),
        };
    }

    // The container slot is the linux node, provisioned exactly as every other linux adapter does it —
    // image of the platform version plus the node script's env. What only the machine knows (its own
    // address, the callback URL that works from there, the per-environment token) the agent adds.
    private containerLaunch(environment: Environment): WorkloadLaunch {
        const provisioning = linuxNodeProvisioning({
            platform: environment.platform.toObject(),
            applications: environment.applications.toArray(),
            baseImage: this.config.baseImage,
            sessionTimeoutSeconds: this.config.sessionTimeoutSeconds,
            screen: this.config.screen,
        });

        return {
            kind: containerSlotKind,
            image: provisioning.image,
            containerPort: this.config.containerPort,
            command: agentBootstrap(linuxNodeEntrypoint),
            env: { ...provisioning.env, SW_SESSION_LOG_GLOB: sessionLogFile },
        };
    }

    // Every provider-bound call carries the account's cloud type, the account and the stereotype inside
    // the otherwise-opaque config — the machines-source keys. Lease rows inherit them in providerContext
    // from birth, so return and orphan sweep always know a machine's cloud even after the binding is gone.
    private context(cloudAccount: CloudAccount, binding: ComputeBinding): Record<string, unknown> {
        return stampProviderContext(binding.config, { type: cloudAccount.type, id: cloudAccount.id }, binding.stereotype);
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
