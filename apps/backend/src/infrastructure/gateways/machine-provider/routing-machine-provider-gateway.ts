import {
    CloudReachability,
    OwnershipVerification,
} from "../../../application/interfaces/gateways/environment-provider-gateway";
import {
    MachineProviderConfig,
    MachineProviderGateway,
} from "../../../application/interfaces/gateways/machine-provider-gateway";
import { InternalError } from "../../../domain/entities/error/internal-error";
import { MachineLease } from "../../../domain/entities/machine-pool/machine-lease";

// The routing discriminator inside the otherwise-opaque provider context/config: the CLOUD TYPE the
// machines come from — no vocabulary of its own, clouds are already the "who provides resources"
// axis. The bridge stamps it from the binding's cloud account when placing (and probing), every host
// row carries it in providerContext from birth — so any later call (return, orphan sweep) still knows
// a machine's cloud even after the binding is gone.
export const machineProviderCloudKey = "cloud";

// One MachineProviderGateway over many clouds-with-big-machines, dispatching by the context's cloud type
// — the pool's use cases stay single-ported and never learn which cloud a machine lives in (mirrors
// RoutingEnvironmentProviderGateway). Adapter CLASSES are named by mechanism (byo, yandex-baremetal)
// and reusable: a future cloud type may plug an existing class under its own key.
export class RoutingMachineProviderGateway extends MachineProviderGateway {
    constructor(private readonly providers: Map<string, MachineProviderGateway>) {
        super();
    }

    async provision(lease: MachineLease): Promise<void> {
        return this.at(lease.providerContext).provision(lease);
    }

    async deprovision(leaseId: string, config: MachineProviderConfig): Promise<void> {
        return this.at(config).deprovision(leaseId, config);
    }

    async listLeaseIds(config: MachineProviderConfig): Promise<Array<string>> {
        return this.at(config).listLeaseIds(config);
    }

    async checkAccess(config: MachineProviderConfig): Promise<CloudReachability> {
        return this.at(config).checkAccess(config);
    }

    async verifyOwnership(config: MachineProviderConfig, markerKey: string): Promise<OwnershipVerification> {
        return this.at(config).verifyOwnership(config, markerKey);
    }

    private at(config: MachineProviderConfig): MachineProviderGateway {
        const cloud = config[machineProviderCloudKey];
        const provider = typeof cloud === "string" ? this.providers.get(cloud) : undefined;

        if (!provider) {
            throw new InternalError(`lease provider: no machines source for cloud ${String(cloud)}`);
        }

        return provider;
    }
}
