import { Uuid } from "../../types/uuid/uuid";
import { InvalidArgumentError } from "../error/invalid-argument-error";

import { HostCapacityExceededError } from "./error/host-capacity-exceeded-error";
import { HostNotPlaceableError } from "./error/host-not-placeable-error";
import { InvalidHostStateTransitionError } from "./error/invalid-host-state-transition-error";
import { Host } from "./host";
import { HostPoolKey } from "./host-pool-key";
import { HostState } from "./host-state";

const poolKey = new HostPoolKey(Uuid.create().getValue(), Uuid.create().getValue());

function createHost(capacitySlots = 3): Host {
    return Host.create({ poolKey, capacitySlots });
}

function environmentId(): string {
    return Uuid.create().getValue();
}

describe("Host", () => {
    test("rejects a capacity outside 1..16 slots", () => {
        expect(() => Host.create({ poolKey, capacitySlots: 0 })).toThrow(InvalidArgumentError);
        expect(() => Host.create({ poolKey, capacitySlots: 17 })).toThrow(InvalidArgumentError);
        expect(() => Host.create({ poolKey, capacitySlots: 2.5 })).toThrow(InvalidArgumentError);
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

        expect(() => host.place(environmentId())).toThrow(HostCapacityExceededError);
    });

    test("accepts placements while still ordering — environments queue onto the booting machine", () => {
        const host = createHost();

        expect(host.state).toBe(HostState.Ordering);
        expect(host.place(environmentId()).slotIndex).toBe(0);
    });

    test("refuses placements once deleting or failed", () => {
        const deleting = createHost();
        deleting.markDeleting();
        expect(() => deleting.place(environmentId())).toThrow(HostNotPlaceableError);

        const failed = createHost();
        failed.markFailed();
        expect(() => failed.place(environmentId())).toThrow(HostNotPlaceableError);
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
        expect(host.state).toBe(HostState.Ready);
        expect(host.hostIp).toBe("10.0.0.5");
        expect(host.lastSeenAt).toBe(now);

        host.markFailed();
        host.register("10.0.0.5", now);
        expect(host.state).toBe(HostState.Ready);
    });

    test("never resurrects a host already chosen for return", () => {
        const host = createHost();

        host.markDeleting();

        expect(() => host.register("10.0.0.5", new Date())).toThrow(InvalidHostStateTransitionError);
        expect(() => host.markFailed()).toThrow(InvalidHostStateTransitionError);
    });

    test("only an empty host may be returned to the cloud", () => {
        const host = createHost();

        host.place(environmentId());

        expect(() => host.markDeleting()).toThrow(InvalidHostStateTransitionError);
    });

    test("round-trips through toObject/fromObject with its placements", () => {
        const host = createHost();
        host.place(environmentId());
        host.register("10.0.0.5", new Date());

        const restored = Host.fromObject(host.toObject());

        expect(restored.toObject()).toEqual(host.toObject());
        expect(restored.placements()).toHaveLength(1);
    });
});
