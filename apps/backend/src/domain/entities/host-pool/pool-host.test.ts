import { Uuid } from "../../types/uuid/uuid";
import { InvalidArgumentError } from "../error/invalid-argument-error";

import { InvalidPoolHostStateTransitionError } from "./error/invalid-pool-host-state-transition-error";
import { PoolHostCapacityExceededError } from "./error/pool-host-capacity-exceeded-error";
import { PoolHostNotPlaceableError } from "./error/pool-host-not-placeable-error";
import { HostPoolKey } from "./host-pool-key";
import { PoolHost } from "./pool-host";
import { PoolHostState } from "./pool-host-state";

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

        expect(host.place(environmentId()).slotIndex).toBe(0);
        expect(host.place(environmentId()).slotIndex).toBe(1);
    });

    test("gives a provisioning retry its existing seat back", () => {
        const host = createHost();
        const envId = environmentId();

        const first = host.place(envId);
        const second = host.place(envId);

        expect(second.slotIndex).toBe(first.slotIndex);
        expect(host.placements()).toHaveLength(1);
    });

    test("reuses a released slot before opening a higher one", () => {
        const host = createHost();
        const first = environmentId();

        host.place(first);
        host.place(environmentId());
        host.release(first);

        expect(host.place(environmentId()).slotIndex).toBe(0);
    });

    test("refuses to overbook a full host", () => {
        const host = createHost(1);

        host.place(environmentId());

        expect(() => host.place(environmentId())).toThrow(PoolHostCapacityExceededError);
    });

    test("accepts placements while still ordering — environments queue onto the booting machine", () => {
        const host = createHost();

        expect(host.state).toBe(PoolHostState.Ordering);
        expect(host.place(environmentId()).slotIndex).toBe(0);
    });

    test("refuses placements once deleting or failed", () => {
        const deleting = createHost();
        deleting.markDeleting();
        expect(() => deleting.place(environmentId())).toThrow(PoolHostNotPlaceableError);

        const failed = createHost();
        failed.markFailed();
        expect(() => failed.place(environmentId())).toThrow(PoolHostNotPlaceableError);
    });

    test("starts the idle clock when the last seat frees up", () => {
        const host = createHost();
        const envId = environmentId();
        const bornEmptyAt = host.lastEmptiedAt;

        host.place(envId);
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

        host.place(environmentId());

        expect(() => host.markDeleting()).toThrow(InvalidPoolHostStateTransitionError);
    });

    test("round-trips through toObject/fromObject with its placements", () => {
        const host = createHost();
        host.place(environmentId());
        host.register("10.0.0.5", new Date());

        const restored = PoolHost.fromObject(host.toObject());

        expect(restored.toObject()).toEqual(host.toObject());
        expect(restored.placements()).toHaveLength(1);
    });
});
