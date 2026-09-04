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

// The routing discriminator inside the otherwise-opaque provider context/config. The bridge stamps it
// when placing (and probing), every host row carries it in providerContext from birth — so any later
// call (return, orphan sweep) still knows which cloud the machine belongs to, even if the binding is
// long gone.
export const hostProviderContextKey = "hostProvider";

// Bring-your-own-host: pre-existing machines the operator attaches by hand (dev Macs, lab boxes).
export const byoHostProviderKey = "byo";
export const yandexBaremetalHostProviderKey = "yandex-baremetal";

// One HostProviderGateway over many clouds-with-big-machines, dispatching by the context's provider
// key — the pool's use cases stay single-ported and never learn which cloud a machine lives in
// (mirrors RoutingEnvironmentProviderGateway).
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
        const key = config[hostProviderContextKey];
        const provider = typeof key === "string" ? this.providers.get(key) : undefined;

        if (!provider) {
            throw new InternalError(`host provider: ${String(key)}: unknown`);
        }

        return provider;
    }
}
