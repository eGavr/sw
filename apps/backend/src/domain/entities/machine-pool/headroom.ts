import { PoolLimits } from "./pool-limits";

// How many more machines a cloud can hand the pool right now, and how big the next one is: a public
// cloud answers "as many as you order, of the configured size" (the pool's own cap is the limit), a
// self-hosted inventory answers with its count of free, ready machines and the slots of the one it
// would hand out next. Read at seating time, so a lease is born with the capacity of the machine it
// will actually get, and no environment is seated on a machine that could never come.
export class Headroom {
    static unbounded(): Headroom {
        return new Headroom(null, null);
    }

    static of(count: number, nextSlotCapacity: number | null): Headroom {
        return new Headroom(Math.max(0, Math.floor(count)), nextSlotCapacity);
    }

    private constructor(
        private readonly count: number | null,
        readonly nextSlotCapacity: number | null,
    ) {}

    get unbounded(): boolean {
        return this.count === null;
    }

    // The pool's effective cap on new leases: its own cap, unless the cloud has fewer machines to give.
    capAt(maxLeases: number): number {
        return this.count === null ? maxLeases : Math.min(maxLeases, this.count);
    }

    // The seating bounds: the pool's cap, and how many leases may wait for a machine at once — every
    // free machine can be spoken for by exactly one waiting lease.
    limitsFor(maxLeases: number): PoolLimits {
        return { maxLeases, maxAwaitingMachine: this.count };
    }

    // What a new lease is worth: the next machine's own slots when the cloud knows them, else the
    // pool's estimate.
    slotCapacityOr(estimate: number): number {
        return this.nextSlotCapacity ?? estimate;
    }
}
