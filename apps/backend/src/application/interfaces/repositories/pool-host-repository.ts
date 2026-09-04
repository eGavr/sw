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

    // Atomically seat a workload in the pool: `mutate` runs on the fullest placeable host, else the
    // pool persists the host `build` returns (already seated) — serialised per pool, so concurrent
    // placers can never order surplus machines. Null when every machine is full and the pool is at its
    // cap. Fullest-first consolidates seats so empty machines can be returned to the cloud.
    abstract placeOrCreate(
        poolKey: HostPoolKey,
        mutate: (host: PoolHost) => void,
        build: () => PoolHost,
        maxHosts: number,
    ): Promise<{ host: PoolHost; created: boolean } | null>;

    abstract save(host: PoolHost): Promise<void>;

    abstract delete(hostId: PoolHostId): Promise<void>;
}
