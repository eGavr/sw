import { Uuid } from "../../types/uuid/uuid";
import { InvalidArgumentError } from "../error/invalid-argument-error";

import { InvalidMachineLeaseStateTransitionError } from "./error/invalid-machine-lease-state-transition-error";
import { MachineLeaseCapacityExceededError } from "./error/machine-lease-capacity-exceeded-error";
import { MachineLeaseNotPlaceableError } from "./error/machine-lease-not-placeable-error";
import { IdleLeaseCriteria } from "./idle-lease-criteria";
import { MachineLease, MachineLeaseData } from "./machine-lease";
import { MachineLeaseState } from "./machine-lease-state";
import { MachinePoolKey } from "./machine-pool-key";
import { ReturnableLeaseCriteria } from "./returnable-lease-criteria";
import { SilentLeaseCriteria } from "./silent-lease-criteria";
import { StuckOrderingCriteria } from "./stuck-ordering-criteria";

const poolKey = new MachinePoolKey(Uuid.create().getValue(), Uuid.create().getValue());

function createHost(slotCapacity = 3): MachineLease {
    return MachineLease.create({ poolKey, slotCapacity });
}

function environmentId(): string {
    return Uuid.create().getValue();
}

describe("MachineLease", () => {
    test("rejects a capacity outside 1..16 slots", () => {
        expect(() => MachineLease.create({ poolKey, slotCapacity: 0 })).toThrow(InvalidArgumentError);
        expect(() => MachineLease.create({ poolKey, slotCapacity: 17 })).toThrow(InvalidArgumentError);
        expect(() => MachineLease.create({ poolKey, slotCapacity: 2.5 })).toThrow(InvalidArgumentError);
    });

    test("seats environments on the lowest free slots", () => {
        const lease = createHost();

        expect(lease.place(environmentId(), {}).slotIndex).toBe(0);
        expect(lease.place(environmentId(), {}).slotIndex).toBe(1);
    });

    test("gives a provisioning retry its existing seat back", () => {
        const lease = createHost();
        const envId = environmentId();

        const first = lease.place(envId, {});
        const second = lease.place(envId, {});

        expect(second.slotIndex).toBe(first.slotIndex);
        expect(lease.assignments()).toHaveLength(1);
    });

    test("carries the seat's launch parameters verbatim for the lease agent", () => {
        const lease = createHost();
        const launch = { avd: "sw-android-34", internalUrl: "http://cp:3002" };

        const assignment = lease.place(environmentId(), launch);

        expect(assignment.launch).toEqual(launch);
        expect(MachineLease.fromObject(lease.toObject()).assignments()[0].launch).toEqual(launch);
    });

    test("reuses a released slot before opening a higher one", () => {
        const lease = createHost();
        const first = environmentId();

        lease.place(first, {});
        lease.place(environmentId(), {});
        lease.release(first);

        expect(lease.place(environmentId(), {}).slotIndex).toBe(0);
    });

    test("refuses to overbook a full lease", () => {
        const lease = createHost(1);

        lease.place(environmentId(), {});

        expect(() => lease.place(environmentId(), {})).toThrow(MachineLeaseCapacityExceededError);
    });

    test("is born enqueued, moves to ordering with its machine, and seats environments all along", () => {
        const lease = createHost();

        expect(lease.state).toBe(MachineLeaseState.Enqueued);
        expect(lease.place(environmentId(), {}).slotIndex).toBe(0);

        lease.adoptMachine({ machineId: Uuid.create().getValue(), slotCapacity: 5 });

        expect(lease.state).toBe(MachineLeaseState.Ordering);
        expect(lease.slotCapacity).toBe(5);
        expect(lease.machineId).not.toBeNull();
    });

    test("never shrinks below what is already seated when the machine turns out smaller", () => {
        const lease = createHost(4);

        lease.place(environmentId(), {});
        lease.place(environmentId(), {});
        lease.adoptMachine({ machineId: Uuid.create().getValue(), slotCapacity: 1 });

        expect(lease.slotCapacity).toBe(2);
        expect(lease.hasFreeSlot()).toBe(false);
    });

    test("accepts assignments while still ordering — environments queue onto the booting machine", () => {
        const lease = createHost();

        lease.adoptMachine({ machineId: Uuid.create().getValue(), slotCapacity: 3 });
        expect(lease.state).toBe(MachineLeaseState.Ordering);
        expect(lease.place(environmentId(), {}).slotIndex).toBe(0);
    });

    test("refuses assignments once deleting or failed", () => {
        const deleting = createHost();
        deleting.markDeleting();
        expect(() => deleting.place(environmentId(), {})).toThrow(MachineLeaseNotPlaceableError);

        const failed = createHost();
        failed.markFailed();
        expect(() => failed.place(environmentId(), {})).toThrow(MachineLeaseNotPlaceableError);
    });

    test("starts the idle clock when the last seat frees up", () => {
        const lease = createHost();
        const envId = environmentId();
        const bornEmptyAt = lease.lastEmptiedAt;

        lease.place(envId, {});
        lease.release(envId);

        expect(lease.isEmpty()).toBe(true);
        expect(lease.lastEmptiedAt.getTime()).toBeGreaterThanOrEqual(bornEmptyAt.getTime());
        expect(lease.release(environmentId())).toBe(false);
    });

    test("registers on the agent's first check-in and recovers a failed lease", () => {
        const now = new Date();
        const lease = createHost();

        lease.register("10.0.0.5", now);
        expect(lease.state).toBe(MachineLeaseState.Ready);
        expect(lease.hostIp).toBe("10.0.0.5");
        expect(lease.lastSeenAt).toBe(now);

        lease.markFailed();
        lease.register("10.0.0.5", now);
        expect(lease.state).toBe(MachineLeaseState.Ready);
    });

    test("never resurrects a lease already chosen for return", () => {
        const lease = createHost();

        lease.markDeleting();

        expect(() => lease.register("10.0.0.5", new Date())).toThrow(InvalidMachineLeaseStateTransitionError);
        expect(() => lease.markFailed()).toThrow(InvalidMachineLeaseStateTransitionError);
    });

    test("only an empty lease may be returned to the cloud", () => {
        const lease = createHost();

        lease.place(environmentId(), {});

        expect(() => lease.markDeleting()).toThrow(InvalidMachineLeaseStateTransitionError);
    });

    describe("sweep commands (each re-checks its criterion, so a raced world wins over the sweep)", () => {
        const now = new Date("2026-09-04T12:00:00.000Z");
        const past = new Date(now.getTime() - 90_000);

        const hostWith = (overrides: Partial<MachineLeaseData>): MachineLease =>
            MachineLease.fromObject({ ...createHost().toObject(), ...overrides });

        test("an empty ready lease past the idle TTL is chosen for return; a fresh or seated one stays", () => {
            const criteria = IdleLeaseCriteria.from(now, 60_000);

            const idle = hostWith({ state: MachineLeaseState.Ready, lastEmptiedAt: past });
            idle.retireIfIdle(criteria);
            expect(idle.state).toBe(MachineLeaseState.Deleting);

            const fresh = hostWith({ state: MachineLeaseState.Ready, lastEmptiedAt: now });
            fresh.retireIfIdle(criteria);
            expect(fresh.state).toBe(MachineLeaseState.Ready);

            const seated = hostWith({ state: MachineLeaseState.Ready, lastEmptiedAt: past });
            seated.place(environmentId(), {});
            seated.retireIfIdle(criteria);
            expect(seated.state).toBe(MachineLeaseState.Ready);
        });

        test("a ready lease silent past the allowance is written off; a talkative one stays", () => {
            const criteria = SilentLeaseCriteria.from(now, 60_000);

            const silent = hostWith({ state: MachineLeaseState.Ready, lastSeenAt: past });
            silent.writeOffIfSilent(criteria);
            expect(silent.state).toBe(MachineLeaseState.Failed);

            const talkative = hostWith({ state: MachineLeaseState.Ready, lastSeenAt: now });
            talkative.writeOffIfSilent(criteria);
            expect(talkative.state).toBe(MachineLeaseState.Ready);

            // A lease whose machine has not checked in yet cannot be silent — nothing has spoken.
            const enqueued = createHost();
            enqueued.writeOffIfSilent(criteria);
            expect(enqueued.state).toBe(MachineLeaseState.Enqueued);
        });

        test("a lease whose machine never arrived past the allowance is written off, enqueued or ordering", () => {
            const stuck = hostWith({ createdAt: past });
            stuck.writeOffIfStuckOrdering(StuckOrderingCriteria.from(now, 60_000));
            expect(stuck.state).toBe(MachineLeaseState.Failed);

            const stuckOrdering = hostWith({ createdAt: past, state: MachineLeaseState.Ordering });
            stuckOrdering.writeOffIfStuckOrdering(StuckOrderingCriteria.from(now, 60_000));
            expect(stuckOrdering.state).toBe(MachineLeaseState.Failed);

            const fresh = hostWith({ createdAt: now });
            fresh.writeOffIfStuckOrdering(StuckOrderingCriteria.from(now, 60_000));
            expect(fresh.state).toBe(MachineLeaseState.Enqueued);
        });

        test("only an empty deleting or failed lease is returnable to the cloud", () => {
            const criteria = ReturnableLeaseCriteria.create();

            const deleting = createHost();
            deleting.markDeleting();
            expect(deleting.isReturnable(criteria)).toBe(true);

            const failedSeated = createHost();
            failedSeated.place(environmentId(), {});
            failedSeated.markFailed();
            expect(failedSeated.isReturnable(criteria)).toBe(false);

            expect(createHost().isReturnable(criteria)).toBe(false);
        });
    });

    test("round-trips through toObject/fromObject with its assignments", () => {
        const lease = createHost();
        lease.place(environmentId(), {});
        lease.register("10.0.0.5", new Date());

        const restored = MachineLease.fromObject(lease.toObject());

        expect(restored.toObject()).toEqual(lease.toObject());
        expect(restored.assignments()).toHaveLength(1);
    });
});
