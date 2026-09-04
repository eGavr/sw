import { Uuid } from "../../types/uuid/uuid";
import { InvalidArgumentError } from "../error/invalid-argument-error";

import { InvalidPoolHostStateTransitionError } from "./error/invalid-pool-host-state-transition-error";
import { PoolHostCapacityExceededError } from "./error/pool-host-capacity-exceeded-error";
import { PoolHostNotPlaceableError } from "./error/pool-host-not-placeable-error";
import { HostPoolKey } from "./host-pool-key";
import { IdleHostCriteria } from "./idle-host-criteria";
import { PoolHost, PoolHostData } from "./pool-host";
import { PoolHostState } from "./pool-host-state";
import { ReturnableHostCriteria } from "./returnable-host-criteria";
import { SilentHostCriteria } from "./silent-host-criteria";
import { StuckOrderingCriteria } from "./stuck-ordering-criteria";

const poolKey = new HostPoolKey(Uuid.create().getValue(), Uuid.create().getValue());

function createHost(capacitySlots = 3): PoolHost {
    return PoolHost.create({ poolKey, capacitySlots });
}

function environmentId(): string {
    return Uuid.create().getValue();
}

describe("PoolHost", () => {
    test("rejects a capacity outside 1..16 slots", () => {
        expect(() => PoolHost.create({ poolKey, capacitySlots: 0 })).toThrow(InvalidArgumentError);
        expect(() => PoolHost.create({ poolKey, capacitySlots: 17 })).toThrow(InvalidArgumentError);
        expect(() => PoolHost.create({ poolKey, capacitySlots: 2.5 })).toThrow(InvalidArgumentError);
    });

    test("seats environments on the lowest free slots", () => {
        const host = createHost();

        expect(host.place(environmentId(), {}).slotIndex).toBe(0);
        expect(host.place(environmentId(), {}).slotIndex).toBe(1);
    });

    test("gives a provisioning retry its existing seat back", () => {
        const host = createHost();
        const envId = environmentId();

        const first = host.place(envId, {});
        const second = host.place(envId, {});

        expect(second.slotIndex).toBe(first.slotIndex);
        expect(host.placements()).toHaveLength(1);
    });

    test("carries the seat's launch parameters verbatim for the host agent", () => {
        const host = createHost();
        const launch = { avd: "sw-android-34", internalUrl: "http://cp:3002" };

        const placement = host.place(environmentId(), launch);

        expect(placement.launch).toEqual(launch);
        expect(PoolHost.fromObject(host.toObject()).placements()[0].launch).toEqual(launch);
    });

    test("reuses a released slot before opening a higher one", () => {
        const host = createHost();
        const first = environmentId();

        host.place(first, {});
        host.place(environmentId(), {});
        host.release(first);

        expect(host.place(environmentId(), {}).slotIndex).toBe(0);
    });

    test("refuses to overbook a full host", () => {
        const host = createHost(1);

        host.place(environmentId(), {});

        expect(() => host.place(environmentId(), {})).toThrow(PoolHostCapacityExceededError);
    });

    test("accepts placements while still ordering — environments queue onto the booting machine", () => {
        const host = createHost();

        expect(host.state).toBe(PoolHostState.Ordering);
        expect(host.place(environmentId(), {}).slotIndex).toBe(0);
    });

    test("refuses placements once deleting or failed", () => {
        const deleting = createHost();
        deleting.markDeleting();
        expect(() => deleting.place(environmentId(), {})).toThrow(PoolHostNotPlaceableError);

        const failed = createHost();
        failed.markFailed();
        expect(() => failed.place(environmentId(), {})).toThrow(PoolHostNotPlaceableError);
    });

    test("starts the idle clock when the last seat frees up", () => {
        const host = createHost();
        const envId = environmentId();
        const bornEmptyAt = host.lastEmptiedAt;

        host.place(envId, {});
        host.release(envId);

        expect(host.isEmpty()).toBe(true);
        expect(host.lastEmptiedAt.getTime()).toBeGreaterThanOrEqual(bornEmptyAt.getTime());
        expect(host.release(environmentId())).toBe(false);
    });

    test("registers on the agent's first check-in and recovers a failed host", () => {
        const now = new Date();
        const host = createHost();

        host.register("10.0.0.5", now);
        expect(host.state).toBe(PoolHostState.Ready);
        expect(host.hostIp).toBe("10.0.0.5");
        expect(host.lastSeenAt).toBe(now);

        host.markFailed();
        host.register("10.0.0.5", now);
        expect(host.state).toBe(PoolHostState.Ready);
    });

    test("never resurrects a host already chosen for return", () => {
        const host = createHost();

        host.markDeleting();

        expect(() => host.register("10.0.0.5", new Date())).toThrow(InvalidPoolHostStateTransitionError);
        expect(() => host.markFailed()).toThrow(InvalidPoolHostStateTransitionError);
    });

    test("only an empty host may be returned to the cloud", () => {
        const host = createHost();

        host.place(environmentId(), {});

        expect(() => host.markDeleting()).toThrow(InvalidPoolHostStateTransitionError);
    });

    describe("sweep commands (each re-checks its criterion, so a raced world wins over the sweep)", () => {
        const now = new Date("2026-09-04T12:00:00.000Z");
        const past = new Date(now.getTime() - 90_000);

        const hostWith = (overrides: Partial<PoolHostData>): PoolHost =>
            PoolHost.fromObject({ ...createHost().toObject(), ...overrides });

        test("an empty ready host past the idle TTL is chosen for return; a fresh or seated one stays", () => {
            const criteria = IdleHostCriteria.from(now, 60_000);

            const idle = hostWith({ state: PoolHostState.Ready, lastEmptiedAt: past });
            idle.retireIfIdle(criteria);
            expect(idle.state).toBe(PoolHostState.Deleting);

            const fresh = hostWith({ state: PoolHostState.Ready, lastEmptiedAt: now });
            fresh.retireIfIdle(criteria);
            expect(fresh.state).toBe(PoolHostState.Ready);

            const seated = hostWith({ state: PoolHostState.Ready, lastEmptiedAt: past });
            seated.place(environmentId(), {});
            seated.retireIfIdle(criteria);
            expect(seated.state).toBe(PoolHostState.Ready);
        });

        test("a ready host silent past the allowance is written off; a talkative one stays", () => {
            const criteria = SilentHostCriteria.from(now, 60_000);

            const silent = hostWith({ state: PoolHostState.Ready, lastSeenAt: past });
            silent.writeOffIfSilent(criteria);
            expect(silent.state).toBe(PoolHostState.Failed);

            const talkative = hostWith({ state: PoolHostState.Ready, lastSeenAt: now });
            talkative.writeOffIfSilent(criteria);
            expect(talkative.state).toBe(PoolHostState.Ready);

            // An ordering host has not checked in yet by definition — silence does not condemn it.
            const ordering = createHost();
            ordering.writeOffIfSilent(criteria);
            expect(ordering.state).toBe(PoolHostState.Ordering);
        });

        test("an order the agent never answered past the allowance is written off", () => {
            const stuck = hostWith({ createdAt: past });
            stuck.writeOffIfStuckOrdering(StuckOrderingCriteria.from(now, 60_000));
            expect(stuck.state).toBe(PoolHostState.Failed);

            const pending = hostWith({ createdAt: now });
            pending.writeOffIfStuckOrdering(StuckOrderingCriteria.from(now, 60_000));
            expect(pending.state).toBe(PoolHostState.Ordering);
        });

        test("only an empty deleting or failed host is returnable to the cloud", () => {
            const criteria = ReturnableHostCriteria.create();

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

    test("round-trips through toObject/fromObject with its placements", () => {
        const host = createHost();
        host.place(environmentId(), {});
        host.register("10.0.0.5", new Date());

        const restored = PoolHost.fromObject(host.toObject());

        expect(restored.toObject()).toEqual(host.toObject());
        expect(restored.placements()).toHaveLength(1);
    });
});
