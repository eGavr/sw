import { InvalidArgumentError } from "../error/invalid-argument-error";

import { InvalidMachineLeaseStateTransitionError } from "./error/invalid-machine-lease-state-transition-error";
import { MachineLeaseCapacityExceededError } from "./error/machine-lease-capacity-exceeded-error";
import { MachineLeaseNotPlaceableError } from "./error/machine-lease-not-placeable-error";
import { IdleLeaseCriteria } from "./idle-lease-criteria";
import { MachineLeaseId } from "./machine-lease-id";
import { MachineLeaseState, placeableMachineLeaseStates } from "./machine-lease-state";
import { MachinePoolKey } from "./machine-pool-key";
import { ReturnableLeaseCriteria } from "./returnable-lease-criteria";
import { SilentLeaseCriteria } from "./silent-lease-criteria";
import { SlotAssignment, SlotAssignmentData, WorkloadLaunch } from "./slot-assignment";
import { SlotPorts } from "./slot-ports";
import { StuckOrderingCriteria } from "./stuck-ordering-criteria";

// The cloud-specific whereabouts of the machine (e.g. the folder it was ordered in). Opaque to the
// domain — the host provider adapter wrote it at ordering time and reads it back at teardown, so the
// host can always be returned even if the binding's config changed meanwhile.
export type MachineLeaseProviderContext = Record<string, unknown>;

export type MachineLeaseData = {
    id: string;
    cloudAccountId: string;
    bindingId: string;
    state: string;
    slotCapacity: number;
    hostIp: string | null;
    providerContext: MachineLeaseProviderContext;
    lastSeenAt: Date | null;
    lastEmptiedAt: Date;
    assignments: ReadonlyArray<SlotAssignmentData>;
    createdAt: Date;
    updatedAt: Date;
};

export type MachineLeaseCreateParams = {
    poolKey: MachinePoolKey;
    slotCapacity: number;
    providerContext?: MachineLeaseProviderContext;
};

type MachineLeaseConstructorParams = {
    id?: MachineLeaseId;
    poolKey: MachinePoolKey;
    state?: MachineLeaseState;
    slotCapacity: number;
    hostIp?: string | null;
    providerContext?: MachineLeaseProviderContext;
    lastSeenAt?: Date | null;
    lastEmptiedAt?: Date;
    assignments?: ReadonlyArray<SlotAssignment>;
    createdAt?: Date;
    updatedAt?: Date;
};

// One big rented machine of a pool, sliced into slots. The capacity invariant lives here: a assignment
// occupies exactly one slot, and the aggregate refuses to overbook. The host's own agent drives the
// slots (it polls for the desired set), so this aggregate only decides WHO sits WHERE — never how a
// slot is launched.
export class MachineLease {
    static create(params: MachineLeaseCreateParams): MachineLease {
        if (!Number.isInteger(params.slotCapacity)
            || params.slotCapacity < 1
            || params.slotCapacity > SlotPorts.maxSlots) {
            throw new InvalidArgumentError(
                `lease capacity must be 1..${SlotPorts.maxSlots} slots, got ${params.slotCapacity}`,
            );
        }

        return new MachineLease(params);
    }

    static fromObject(data: MachineLeaseData): MachineLease {
        return new MachineLease({
            id: MachineLeaseId.fromString(data.id),
            poolKey: new MachinePoolKey(data.cloudAccountId, data.bindingId),
            state: data.state as MachineLeaseState,
            slotCapacity: data.slotCapacity,
            hostIp: data.hostIp ?? null,
            providerContext: data.providerContext ?? {},
            lastSeenAt: data.lastSeenAt ?? null,
            lastEmptiedAt: data.lastEmptiedAt,
            assignments: (data.assignments ?? []).map(SlotAssignment.fromObject),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
        });
    }

    readonly slotCapacity: number;
    readonly createdAt: Date;

    private readonly _id: MachineLeaseId;
    private readonly _poolKey: MachinePoolKey;
    private readonly _providerContext: MachineLeaseProviderContext;
    private _state: MachineLeaseState;
    private _hostIp: string | null;
    private _lastSeenAt: Date | null;
    private _lastEmptiedAt: Date;
    private _placements: Array<SlotAssignment>;
    private _updatedAt: Date;

    private constructor(params: MachineLeaseConstructorParams) {
        this._id = params.id ?? MachineLeaseId.create();
        this._poolKey = params.poolKey;
        this._state = params.state ?? MachineLeaseState.Ordering;
        this.slotCapacity = params.slotCapacity;
        this._hostIp = params.hostIp ?? null;
        this._providerContext = params.providerContext ?? {};
        this._lastSeenAt = params.lastSeenAt ?? null;
        this.createdAt = params.createdAt ?? new Date();
        // A host is "empty since birth": if nothing ever lands on it, the idle sweep may still reclaim it.
        this._lastEmptiedAt = params.lastEmptiedAt ?? this.createdAt;
        this._placements = [...(params.assignments ?? [])];
        this._updatedAt = params.updatedAt ?? this.createdAt;
    }

    get id(): string {
        return this._id.getValue();
    }

    get poolKey(): MachinePoolKey {
        return this._poolKey;
    }

    get state(): MachineLeaseState {
        return this._state;
    }

    get hostIp(): string | null {
        return this._hostIp;
    }

    get providerContext(): MachineLeaseProviderContext {
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

    assignments(): ReadonlyArray<SlotAssignment> {
        return [...this._placements];
    }

    assignmentFor(environmentId: string): SlotAssignment | null {
        return this._placements.find((assignment) => assignment.environmentId === environmentId) ?? null;
    }

    isEmpty(): boolean {
        return this._placements.length === 0;
    }

    hasFreeSlot(): boolean {
        return this._placements.length < this.slotCapacity;
    }

    // Seat an environment on this host. Idempotent per environment (a provisioning retry gets its
    // existing seat back); the lowest free slot index keeps the port ranges dense.
    place(environmentId: string, launch: WorkloadLaunch): SlotAssignment {
        const existing = this.assignmentFor(environmentId);

        if (existing) {
            return existing;
        }

        if (!placeableMachineLeaseStates.includes(this._state)) {
            throw new MachineLeaseNotPlaceableError(this.id, this._state);
        }

        if (!this.hasFreeSlot()) {
            throw new MachineLeaseCapacityExceededError(this.id, this.slotCapacity);
        }

        const assignment = SlotAssignment.create({
            environmentId,
            slotIndex: this.lowestFreeSlotIndex(),
            launch,
        });

        this._placements.push(assignment);
        this.touch();

        return assignment;
    }

    // Free the environment's seat. Emptying the host starts its idle clock — the reconcile sweep
    // returns machines that stayed empty past the pool's TTL.
    release(environmentId: string): boolean {
        const remaining = this._placements.filter((assignment) => assignment.environmentId !== environmentId);
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
        if (this._state === MachineLeaseState.Deleting) {
            throw new InvalidMachineLeaseStateTransitionError(this._state, MachineLeaseState.Ready);
        }

        this._state = MachineLeaseState.Ready;
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
            throw new InvalidMachineLeaseStateTransitionError(this._state, MachineLeaseState.Deleting);
        }

        this._state = MachineLeaseState.Deleting;
        this.touch();
    }

    // The host went silent (or never came up): stop placing onto it and let its workloads die on
    // their own; once empty it gets returned to the cloud.
    markFailed(): void {
        if (this._state === MachineLeaseState.Deleting) {
            throw new InvalidMachineLeaseStateTransitionError(this._state, MachineLeaseState.Failed);
        }

        this._state = MachineLeaseState.Failed;
        this.touch();
    }

    // The sweep commands run against the freshest row under the repository's lock, so each re-checks
    // its own criterion and no-ops when the world moved on (a seat landed, the agent checked in).

    // Lingering empty is the point — the next environment starts in seconds; past the pool's TTL the
    // machine only burns money, so it is chosen for return.
    retireIfIdle(criteria: IdleLeaseCriteria): void {
        const predicate = criteria.toPredicate();

        if (!predicate.states.includes(this._state) || !this.isEmpty()) {
            return;
        }

        if (this._lastEmptiedAt < predicate.emptiedBefore) {
            this.markDeleting();
        }
    }

    // The agent polls every few seconds; a long silence means the machine, its network or the agent
    // is gone — stop placing onto it (its workloads die on their own clocks).
    writeOffIfSilent(criteria: SilentLeaseCriteria): void {
        const predicate = criteria.toPredicate();

        if (!predicate.states.includes(this._state) || this._lastSeenAt === null) {
            return;
        }

        if (this._lastSeenAt < predicate.lastSeenBefore) {
            this.markFailed();
        }
    }

    // The first check-in flips a host to ready, so age in `ordering` is exactly how long the hand-over
    // has been pending; past the allowance the order is written off (and returned, in case it half-exists).
    writeOffIfStuckOrdering(criteria: StuckOrderingCriteria): void {
        if (this._state !== criteria.toPredicate().state) {
            return;
        }

        if (this.createdAt < criteria.toPredicate().createdBefore) {
            this.markFailed();
        }
    }

    // Ready to be handed back to the cloud: chosen for return or written off — and holding no seats.
    isReturnable(criteria: ReturnableLeaseCriteria): boolean {
        const predicate = criteria.toPredicate();

        return predicate.states.includes(this._state) && this.isEmpty();
    }

    toObject(): MachineLeaseData {
        return {
            id: this.id,
            cloudAccountId: this._poolKey.cloudAccountId,
            bindingId: this._poolKey.bindingId,
            state: this._state,
            slotCapacity: this.slotCapacity,
            hostIp: this._hostIp,
            providerContext: { ...this._providerContext },
            lastSeenAt: this._lastSeenAt,
            lastEmptiedAt: this._lastEmptiedAt,
            assignments: this._placements.map((assignment) => assignment.toObject()),
            createdAt: this.createdAt,
            updatedAt: this._updatedAt,
        };
    }

    private lowestFreeSlotIndex(): number {
        const taken = new Set(this._placements.map((assignment) => assignment.slotIndex));

        for (let index = 0; index < this.slotCapacity; index += 1) {
            if (!taken.has(index)) {
                return index;
            }
        }

        throw new MachineLeaseCapacityExceededError(this.id, this.slotCapacity);
    }

    private touch(): void {
        this._updatedAt = new Date();
    }
}
