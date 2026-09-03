import { InvalidArgumentError } from "../error/invalid-argument-error";

import { HostCapacityExceededError } from "./error/host-capacity-exceeded-error";
import { HostNotPlaceableError } from "./error/host-not-placeable-error";
import { InvalidHostStateTransitionError } from "./error/invalid-host-state-transition-error";
import { HostId } from "./host-id";
import { HostPlacement, HostPlacementData } from "./host-placement";
import { HostPoolKey } from "./host-pool-key";
import { HostState, placeableHostStates } from "./host-state";
import { SlotPorts } from "./slot-ports";

// The cloud-specific whereabouts of the machine (e.g. the folder it was ordered in). Opaque to the
// domain — the host provider adapter wrote it at ordering time and reads it back at teardown, so the
// host can always be returned even if the binding's config changed meanwhile.
export type HostProviderContext = Record<string, unknown>;

export type HostData = {
    id: string;
    cloudAccountId: string;
    bindingId: string;
    state: string;
    capacitySlots: number;
    hostIp: string | null;
    providerContext: HostProviderContext;
    lastSeenAt: Date | null;
    lastEmptiedAt: Date;
    placements: ReadonlyArray<HostPlacementData>;
    createdAt: Date;
    updatedAt: Date;
};

export type HostCreateParams = {
    poolKey: HostPoolKey;
    capacitySlots: number;
    providerContext?: HostProviderContext;
};

type HostConstructorParams = {
    id?: HostId;
    poolKey: HostPoolKey;
    state?: HostState;
    capacitySlots: number;
    hostIp?: string | null;
    providerContext?: HostProviderContext;
    lastSeenAt?: Date | null;
    lastEmptiedAt?: Date;
    placements?: ReadonlyArray<HostPlacement>;
    createdAt?: Date;
    updatedAt?: Date;
};

// One big rented machine of a pool, sliced into slots. The capacity invariant lives here: a placement
// occupies exactly one slot, and the aggregate refuses to overbook. The host's own agent drives the
// slots (it polls for the desired set), so this aggregate only decides WHO sits WHERE — never how a
// slot is launched.
export class Host {
    static create(params: HostCreateParams): Host {
        if (!Number.isInteger(params.capacitySlots)
            || params.capacitySlots < 1
            || params.capacitySlots > SlotPorts.maxSlots) {
            throw new InvalidArgumentError(
                `host capacity must be 1..${SlotPorts.maxSlots} slots, got ${params.capacitySlots}`,
            );
        }

        return new Host(params);
    }

    static fromObject(data: HostData): Host {
        return new Host({
            id: HostId.fromString(data.id),
            poolKey: new HostPoolKey(data.cloudAccountId, data.bindingId),
            state: data.state as HostState,
            capacitySlots: data.capacitySlots,
            hostIp: data.hostIp ?? null,
            providerContext: data.providerContext ?? {},
            lastSeenAt: data.lastSeenAt ?? null,
            lastEmptiedAt: data.lastEmptiedAt,
            placements: (data.placements ?? []).map(HostPlacement.fromObject),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
        });
    }

    readonly capacitySlots: number;
    readonly createdAt: Date;

    private readonly _id: HostId;
    private readonly _poolKey: HostPoolKey;
    private readonly _providerContext: HostProviderContext;
    private _state: HostState;
    private _hostIp: string | null;
    private _lastSeenAt: Date | null;
    private _lastEmptiedAt: Date;
    private _placements: Array<HostPlacement>;
    private _updatedAt: Date;

    private constructor(params: HostConstructorParams) {
        this._id = params.id ?? HostId.create();
        this._poolKey = params.poolKey;
        this._state = params.state ?? HostState.Ordering;
        this.capacitySlots = params.capacitySlots;
        this._hostIp = params.hostIp ?? null;
        this._providerContext = params.providerContext ?? {};
        this._lastSeenAt = params.lastSeenAt ?? null;
        this.createdAt = params.createdAt ?? new Date();
        // A host is "empty since birth": if nothing ever lands on it, the idle sweep may still reclaim it.
        this._lastEmptiedAt = params.lastEmptiedAt ?? this.createdAt;
        this._placements = [...(params.placements ?? [])];
        this._updatedAt = params.updatedAt ?? this.createdAt;
    }

    get id(): string {
        return this._id.getValue();
    }

    get poolKey(): HostPoolKey {
        return this._poolKey;
    }

    get state(): HostState {
        return this._state;
    }

    get hostIp(): string | null {
        return this._hostIp;
    }

    get providerContext(): HostProviderContext {
        return { ...this._providerContext };
    }

    get lastSeenAt(): Date | null {
        return this._lastSeenAt;
    }

    get lastEmptiedAt(): Date {
        return this._lastEmptiedAt;
    }

    get updatedAt(): Date {
        return this._updatedAt;
    }

    placements(): ReadonlyArray<HostPlacement> {
        return [...this._placements];
    }

    placementFor(environmentId: string): HostPlacement | null {
        return this._placements.find((placement) => placement.environmentId === environmentId) ?? null;
    }

    isEmpty(): boolean {
        return this._placements.length === 0;
    }

    hasFreeSlot(): boolean {
        return this._placements.length < this.capacitySlots;
    }

    // Seat an environment on this host. Idempotent per environment (a provisioning retry gets its
    // existing seat back); the lowest free slot index keeps the port ranges dense.
    place(environmentId: string): HostPlacement {
        const existing = this.placementFor(environmentId);

        if (existing) {
            return existing;
        }

        if (!placeableHostStates.includes(this._state)) {
            throw new HostNotPlaceableError(this.id, this._state);
        }

        if (!this.hasFreeSlot()) {
            throw new HostCapacityExceededError(this.id, this.capacitySlots);
        }

        const placement = HostPlacement.create({
            environmentId,
            slotIndex: this.lowestFreeSlotIndex(),
        });

        this._placements.push(placement);
        this.touch();

        return placement;
    }

    // Free the environment's seat. Emptying the host starts its idle clock — the reconcile sweep
    // returns machines that stayed empty past the pool's TTL.
    release(environmentId: string): boolean {
        const remaining = this._placements.filter((placement) => placement.environmentId !== environmentId);
        const removed = remaining.length !== this._placements.length;

        this._placements = remaining;

        if (removed) {
            if (this._placements.length === 0) {
                this._lastEmptiedAt = new Date();
            }

            this.touch();
        }

        return removed;
    }

    // The agent's first check-in: the machine is up and reachable at hostIp. A `failed` host that
    // checks in again recovers — it proved it is alive.
    register(hostIp: string, now: Date): void {
        if (this._state === HostState.Deleting) {
            throw new InvalidHostStateTransitionError(this._state, HostState.Ready);
        }

        this._state = HostState.Ready;
        this._hostIp = hostIp;
        this._lastSeenAt = now;
        this.touch();
    }

    heartbeat(now: Date): void {
        this._lastSeenAt = now;
        this.touch();
    }

    // Chosen for return to the cloud; only an empty host may go — live seats never get pulled away.
    markDeleting(): void {
        if (!this.isEmpty()) {
            throw new InvalidHostStateTransitionError(this._state, HostState.Deleting);
        }

        this._state = HostState.Deleting;
        this.touch();
    }

    // The host went silent (or never came up): stop placing onto it and let its workloads die on
    // their own; once empty it gets returned to the cloud.
    markFailed(): void {
        if (this._state === HostState.Deleting) {
            throw new InvalidHostStateTransitionError(this._state, HostState.Failed);
        }

        this._state = HostState.Failed;
        this.touch();
    }

    toObject(): HostData {
        return {
            id: this.id,
            cloudAccountId: this._poolKey.cloudAccountId,
            bindingId: this._poolKey.bindingId,
            state: this._state,
            capacitySlots: this.capacitySlots,
            hostIp: this._hostIp,
            providerContext: { ...this._providerContext },
            lastSeenAt: this._lastSeenAt,
            lastEmptiedAt: this._lastEmptiedAt,
            placements: this._placements.map((placement) => placement.toObject()),
            createdAt: this.createdAt,
            updatedAt: this._updatedAt,
        };
    }

    private lowestFreeSlotIndex(): number {
        const taken = new Set(this._placements.map((placement) => placement.slotIndex));

        for (let index = 0; index < this.capacitySlots; index += 1) {
            if (!taken.has(index)) {
                return index;
            }
        }

        throw new HostCapacityExceededError(this.id, this.capacitySlots);
    }

    private touch(): void {
        this._updatedAt = new Date();
    }
}
