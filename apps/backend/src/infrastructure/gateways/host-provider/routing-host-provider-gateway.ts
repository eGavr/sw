import {
    CloudReachability,
    OwnershipVerification,
} from "../../../application/interfaces/gateways/environment-provider-gateway";
import {
    HostProviderConfig,
    HostProviderGateway,
} from "../../../application/interfaces/gateways/host-provider-gateway";
import { InternalError } from "../../../domain/entities/error/internal-error";
import { PoolHost } from "../../../domain/entities/host-pool/pool-host";

// The routing discriminator inside the otherwise-opaque provider context/config: the CLOUD TYPE the
// machines come from — no vocabulary of its own, clouds are already the "who provides resources"
// axis. The bridge stamps it from the binding's cloud account when placing (and probing), every host
// row carries it in providerContext from birth — so any later call (return, orphan sweep) still knows
// a machine's cloud even after the binding is gone.
export const hostProviderCloudKey = "cloud";

// One HostProviderGateway over many clouds-with-big-machines, dispatching by the context's cloud type
// — the pool's use cases stay single-ported and never learn which cloud a machine lives in (mirrors
// RoutingEnvironmentProviderGateway). Adapter CLASSES are named by mechanism (byo, yandex-baremetal)
// and reusable: a future cloud type may plug an existing class under its own key.
export class RoutingHostProviderGateway extends HostProviderGateway {
    constructor(private readonly providers: Map<string, HostProviderGateway>) {
        super();
    }

    async provision(host: PoolHost): Promise<void> {
        return this.at(host.providerContext).provision(host);
    }

    async deprovision(hostId: string, config: HostProviderConfig): Promise<void> {
        return this.at(config).deprovision(hostId, config);
    }

    async listLeasedHostIds(config: HostProviderConfig): Promise<Array<string>> {
        return this.at(config).listLeasedHostIds(config);
    }

    async checkAccess(config: HostProviderConfig): Promise<CloudReachability> {
        return this.at(config).checkAccess(config);
    }

    async verifyOwnership(config: HostProviderConfig, markerKey: string): Promise<OwnershipVerification> {
        return this.at(config).verifyOwnership(config, markerKey);
    }

    private at(config: HostProviderConfig): HostProviderGateway {
        const cloud = config[hostProviderCloudKey];
        const provider = typeof cloud === "string" ? this.providers.get(cloud) : undefined;

        if (!provider) {
            throw new InternalError(`host provider: no machines source for cloud ${String(cloud)}`);
        }

        return provider;
    }
}
