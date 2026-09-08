import {
    CloudReachability,
    OwnershipVerification,
} from "../../../application/interfaces/gateways/environment-provider-gateway";
import {
    MachineProviderConfig,
    MachineProviderGateway,
} from "../../../application/interfaces/gateways/machine-provider-gateway";
import { InternalError } from "../../../domain/entities/error/internal-error";
import { Headroom } from "../../../domain/entities/machine-pool/headroom";
import { MachineLease } from "../../../domain/entities/machine-pool/machine-lease";
import { ProvisionedMachine } from "../../../domain/entities/machine-pool/provisioned-machine";

import { machineProviderCloudKey } from "./machine-provider-context";

// One MachineProviderGateway over many clouds-with-big-machines, dispatching by the context's cloud type
// — the pool's use cases stay single-ported and never learn which cloud a machine lives in (mirrors
// RoutingEnvironmentProviderGateway).
export class RoutingMachineProviderGateway extends MachineProviderGateway {
    constructor(private readonly providers: Map<string, MachineProviderGateway>) {
        super();
    }

    async provision(lease: MachineLease): Promise<ProvisionedMachine> {
        return this.at(lease.providerContext).provision(lease);
    }

    async deprovision(leaseId: string, config: MachineProviderConfig): Promise<void> {
        return this.at(config).deprovision(leaseId, config);
    }

    async listLeaseIds(config: MachineProviderConfig): Promise<Array<string>> {
        return this.at(config).listLeaseIds(config);
    }

    async headroom(config: MachineProviderConfig): Promise<Headroom> {
        return this.at(config).headroom(config);
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
            throw new InternalError(`machine provider: no machines source for cloud ${String(cloud)}`);
        }

        return provider;
    }
}
