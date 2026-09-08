import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { MachineLease, MachineLeaseProviderContext } from "../../../domain/entities/machine-pool/machine-lease";
import { MachineLeaseId } from "../../../domain/entities/machine-pool/machine-lease-id";
import { MachinePoolKey } from "../../../domain/entities/machine-pool/machine-pool-key";

export type CreateMachineLeaseParams = {
    readonly poolKey: MachinePoolKey;
    readonly slotCapacity: number;
    readonly providerContext?: MachineLeaseProviderContext;
};

export abstract class MachineLeaseRepository {
    abstract create(params: CreateMachineLeaseParams): Promise<MachineLease>;

    abstract get(leaseId: MachineLeaseId): Promise<MachineLease>;

    // The host holding this environment's seat, if any — the release path starts from the environment.
    abstract findByEnvironment(environmentId: EnvironmentId): Promise<MachineLease | null>;

    // Atomically read the host under a row lock and run `mutate` (a domain transition) on it; null
    // when the host is gone. The lock/tx are the data source's job.
    abstract with(leaseId: MachineLeaseId, mutate: (lease: MachineLease) => void): Promise<MachineLease | null>;

    // Atomically seat a workload in the pool: `mutate` runs on the fullest placeable host, else the
    // pool persists the host `build` returns (already seated) — serialised per pool, so concurrent
    // placers can never order surplus machines. Null when every machine is full and the pool is at its
    // cap. Fullest-first consolidates seats so empty machines can be returned to the cloud.
    abstract placeOrCreate(
        poolKey: MachinePoolKey,
        mutate: (lease: MachineLease) => void,
        build: () => MachineLease,
        maxHosts: number,
    ): Promise<{ lease: MachineLease; created: boolean } | null>;

    // Every machine of every pool — the reconcile sweep's working set (machines are expensive, the
    // table is small by construction).
    abstract listAll(): Promise<Array<MachineLease>>;

    abstract save(lease: MachineLease): Promise<void>;

    abstract delete(leaseId: MachineLeaseId): Promise<void>;
}
