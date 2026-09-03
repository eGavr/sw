import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { HostPoolKey } from "../../../domain/entities/host-pool/host-pool-key";
import { PoolHost, PoolHostProviderContext } from "../../../domain/entities/host-pool/pool-host";
import { PoolHostId } from "../../../domain/entities/host-pool/pool-host-id";

export type CreatePoolHostParams = {
    readonly poolKey: HostPoolKey;
    readonly capacitySlots: number;
    readonly providerContext?: PoolHostProviderContext;
};

export abstract class PoolHostRepository {
    abstract create(params: CreatePoolHostParams): Promise<PoolHost>;

    abstract get(hostId: PoolHostId): Promise<PoolHost>;

    // The host holding this environment's seat, if any — the release path starts from the environment.
    abstract findByEnvironment(environmentId: EnvironmentId): Promise<PoolHost | null>;

    // Atomically read the host under a row lock and run `mutate` (a domain transition) on it; null
    // when the host is gone. The lock/tx are the data source's job.
    abstract with(hostId: PoolHostId, mutate: (host: PoolHost) => void): Promise<PoolHost | null>;

    // Atomically claim the pool's fullest host that still has a free seat and run `mutate` (e.g.
    // host.place(...)) on it; null when every machine is full or gone — the caller orders a new one.
    // Fullest-first consolidates seats so empty machines can be returned to the cloud.
    abstract withMostLoadedPlaceable(poolKey: HostPoolKey, mutate: (host: PoolHost) => void): Promise<PoolHost | null>;

    // How many machines the pool currently holds (any state) — the spend-cap probe before ordering
    // another one.
    abstract countByPool(poolKey: HostPoolKey): Promise<number>;

    abstract save(host: PoolHost): Promise<void>;

    abstract delete(hostId: PoolHostId): Promise<void>;
}
