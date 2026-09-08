import { FreeMachineCriteria } from "../../../domain/entities/machine/free-machine-criteria";
import { Machine } from "../../../domain/entities/machine/machine";
import { MachineId } from "../../../domain/entities/machine/machine-id";

// Storage of the machine inventory: every machine the control plane knows, across clouds — the user's
// attached boxes and the ones we ordered. The claim is the one storage-level race: the pool asks for
// "a free machine of this stereotype", and two pools asking at once must get two machines.
export abstract class MachineRepository {
    abstract create(machine: Machine): Promise<void>;

    abstract get(machineId: MachineId): Promise<Machine>;

    abstract find(machineId: MachineId): Promise<Machine | null>;

    // The machine a lease holds, if any (a lease's machine may have been detached with force).
    abstract findByLease(leaseId: string): Promise<Machine | null>;

    abstract listByCloudAccount(cloudAccountId: string): Promise<Array<Machine>>;

    // Every machine of every cloud — the silence sweep's working set (small by construction).
    abstract listAll(): Promise<Array<Machine>>;

    // The lease ids currently held on a cloud's machines — the pool's orphan sweep compares them with
    // its rows, so a lost row never leaves a machine leased forever.
    abstract listLeaseIds(cloudAccountId: string): Promise<Array<string>>;

    abstract countFree(criteria: FreeMachineCriteria): Promise<number>;

    // The machine a claim would take next (the oldest free one) — read, not taken.
    abstract findNextFree(criteria: FreeMachineCriteria): Promise<Machine | null>;

    // Atomically read the machine under a row lock and run `mutate` (a domain transition) on it; null
    // when the machine is gone. The lock/tx are the data source's job.
    abstract with(machineId: MachineId, mutate: (machine: Machine) => void): Promise<Machine | null>;

    // Atomically take ONE free machine matching the criteria: locked with SKIP LOCKED so concurrent
    // claimers each get their own; `mutate` runs the claim on it. Null when none is free.
    abstract withFreeMachine(criteria: FreeMachineCriteria, mutate: (machine: Machine) => void): Promise<Machine | null>;

    abstract save(machine: Machine): Promise<void>;

    abstract delete(machineId: MachineId): Promise<void>;
}
