import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { Host, HostProviderContext } from "../../../domain/entities/host-pool/host";
import { HostId } from "../../../domain/entities/host-pool/host-id";
import { HostPoolKey } from "../../../domain/entities/host-pool/host-pool-key";

export type CreateHostParams = {
    readonly poolKey: HostPoolKey;
    readonly capacitySlots: number;
    readonly providerContext?: HostProviderContext;
};

export abstract class HostRepository {
    abstract create(params: CreateHostParams): Promise<Host>;

    abstract get(hostId: HostId): Promise<Host>;

    // The host holding this environment's seat, if any — the release path starts from the environment.
    abstract findByEnvironment(environmentId: EnvironmentId): Promise<Host | null>;

    // Atomically read the host under a row lock and run `mutate` (a domain transition) on it; null
    // when the host is gone. The lock/tx are the data source's job.
    abstract with(hostId: HostId, mutate: (host: Host) => void): Promise<Host | null>;

    // Atomically claim the pool's fullest host that still has a free seat and run `mutate` (e.g.
    // host.place(...)) on it; null when every machine is full or gone — the caller orders a new one.
    // Fullest-first consolidates seats so empty machines can be returned to the cloud.
    abstract withMostLoadedPlaceable(poolKey: HostPoolKey, mutate: (host: Host) => void): Promise<Host | null>;

    abstract save(host: Host): Promise<void>;

    abstract delete(hostId: HostId): Promise<void>;
}
