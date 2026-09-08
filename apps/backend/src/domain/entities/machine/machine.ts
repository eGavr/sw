import { Stereotype, StereotypeData } from "../cloud-account/stereotype";
import { Execution } from "../environment/execution";
import { InvalidArgumentError } from "../error/invalid-argument-error";

import { EmptyProvidesError } from "./error/empty-provides-error";
import { InvalidMachineAdmissionTransitionError } from "./error/invalid-machine-admission-transition-error";
import { MachineNotClaimableError } from "./error/machine-not-claimable-error";
import { RegistrationTokenInvalidError } from "./error/registration-token-invalid-error";
import { MachineAdmission } from "./machine-admission";
import { judgeConditions, MachineCondition } from "./machine-condition";
import { MachineFacts, MachineFactsData } from "./machine-facts";
import { MachineId } from "./machine-id";
import { MachineOrigin } from "./machine-origin";
import { MachineState } from "./machine-state";
import { SilentMachineCriteria } from "./silent-machine-criteria";
import { SlotCapacityPolicy } from "./slot-capacity-policy";

export type MachineData = {
    id: string;
    cloudAccountId: string;
    origin: string;
    fqdn: string | null;
    provides: ReadonlyArray<StereotypeData>;
    state: string;
    admission: string;
    facts: MachineFactsData | null;
    slotCapacityOverride: number | null;
    slotCapacity: number | null;
    ready: boolean;
    leaseId: string | null;
    registrationTokenHash: string | null;
    registrationTokenExpiresAt: Date | null;
    lastSyncAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

export type MachineAttachParams = {
    cloudAccountId: string;
    origin: MachineOrigin;
    fqdn: string | null;
    provides: ReadonlyArray<Stereotype>;
    slotCapacityOverride?: number | null;
    // An ordered machine is claimed from birth by the lease that ordered it.
    leaseId?: string | null;
};

type MachineConstructorParams = {
    id?: MachineId;
    cloudAccountId: string;
    origin: MachineOrigin;
    fqdn: string | null;
    provides: ReadonlyArray<Stereotype>;
    state?: MachineState;
    admission?: MachineAdmission;
    facts?: MachineFacts | null;
    slotCapacityOverride?: number | null;
    slotCapacity?: number | null;
    leaseId?: string | null;
    registrationTokenHash?: string | null;
    registrationTokenExpiresAt?: Date | null;
    lastSyncAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
};

// A machine the control plane knows: a box the user attached to their self-hosted cloud, or one we
// ordered from a cloud for a lease. Physical or virtual is not its business — what is: where it is
// reachable, what it can run (its stereotypes, judged against the facts its agent reports), how many
// slots it is worth, what the operator wants of it (admission), and whether the pool holds it right
// now (its lease). Machines are what the pool leases; a lease never outlives the machine's readiness.
export class Machine {
    static attach(params: MachineAttachParams): Machine {
        if (params.provides.length === 0) {
            throw new InvalidArgumentError("machine: must provide at least one stereotype");
        }
        Machine.validateOverride(params.slotCapacityOverride ?? null);

        return new Machine({
            cloudAccountId: params.cloudAccountId,
            origin: params.origin,
            fqdn: params.fqdn,
            provides: params.provides,
            slotCapacityOverride: params.slotCapacityOverride ?? null,
            slotCapacity: params.slotCapacityOverride ?? null,
            leaseId: params.leaseId ?? null,
        });
    }

    static fromObject(data: MachineData): Machine {
        return new Machine({
            id: MachineId.fromString(data.id),
            cloudAccountId: data.cloudAccountId,
            origin: data.origin as MachineOrigin,
            fqdn: data.fqdn,
            provides: data.provides.map(Stereotype.fromObject),
            state: data.state as MachineState,
            admission: data.admission as MachineAdmission,
            facts: data.facts ? MachineFacts.fromObject(data.facts) : null,
            slotCapacityOverride: data.slotCapacityOverride,
            slotCapacity: data.slotCapacity,
            leaseId: data.leaseId,
            registrationTokenHash: data.registrationTokenHash,
            registrationTokenExpiresAt: data.registrationTokenExpiresAt,
            lastSyncAt: data.lastSyncAt,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
        });
    }

    private static validateOverride(override: number | null): void {
        if (override !== null && (!Number.isInteger(override) || override < 1)) {
            throw new InvalidArgumentError(`machine: slot capacity override must be a positive integer, got ${override}`);
        }
    }

    readonly cloudAccountId: string;
    readonly origin: MachineOrigin;
    readonly createdAt: Date;
    private readonly _id: MachineId;
    private _provides: ReadonlyArray<Stereotype>;
    private readonly _slotCapacityOverride: number | null;
    private _fqdn: string | null;
    private _state: MachineState;
    private _admission: MachineAdmission;
    private _facts: MachineFacts | null;
    private _slotCapacity: number | null;
    private _leaseId: string | null;
    private _registrationTokenHash: string | null;
    private _registrationTokenExpiresAt: Date | null;
    private _lastSyncAt: Date | null;
    private _updatedAt: Date;

    private constructor(params: MachineConstructorParams) {
        this._id = params.id ?? MachineId.create();
        this.cloudAccountId = params.cloudAccountId;
        this.origin = params.origin;
        this._fqdn = params.fqdn;
        this._provides = [...params.provides];
        this._state = params.state ?? MachineState.Pending;
        this._admission = params.admission ?? MachineAdmission.Open;
        this._facts = params.facts ?? null;
        this._slotCapacityOverride = params.slotCapacityOverride ?? null;
        this._slotCapacity = params.slotCapacity ?? null;
        this._leaseId = params.leaseId ?? null;
        this._registrationTokenHash = params.registrationTokenHash ?? null;
        this._registrationTokenExpiresAt = params.registrationTokenExpiresAt ?? null;
        this._lastSyncAt = params.lastSyncAt ?? null;
        this.createdAt = params.createdAt ?? new Date();
        this._updatedAt = params.updatedAt ?? this.createdAt;
    }

    get id(): string {
        return this._id.getValue();
    }

    get fqdn(): string | null {
        return this._fqdn;
    }

    get state(): MachineState {
        return this._state;
    }

    get admission(): MachineAdmission {
        return this._admission;
    }

    get facts(): MachineFacts | null {
        return this._facts;
    }

    get slotCapacity(): number | null {
        return this._slotCapacity;
    }

    get leaseId(): string | null {
        return this._leaseId;
    }

    get lastSyncAt(): Date | null {
        return this._lastSyncAt;
    }

    get updatedAt(): Date {
        return this._updatedAt;
    }

    provides(): ReadonlyArray<Stereotype> {
        return [...this._provides];
    }

    // The operator re-declares what the box can serve (a machine that gained docker now runs browser
    // slots too). Fitness is re-judged from the same facts, so a machine can lose `ready` right here —
    // that is the point: it stops being taken for what it cannot run. A machine that serves nothing
    // would be inventory noise the pool can never use.
    reprovide(stereotypes: ReadonlyArray<Stereotype>): void {
        if (stereotypes.length === 0) {
            throw new EmptyProvidesError(this.id);
        }

        this._provides = [...stereotypes];
        this.touch();
    }

    providesStereotype(platformName: string, execution: Execution): boolean {
        return this._provides.some((stereotype) => stereotype.matches(platformName, execution));
    }

    conditions(): ReadonlyArray<MachineCondition> {
        return judgeConditions(this._provides, this._facts);
    }

    // The one word the pool reads: reachable, admitted by the operator, fit for what it provides.
    isReady(): boolean {
        return this._state === MachineState.Online
            && this._admission === MachineAdmission.Open
            && !this.conditions().some((condition) => condition.blocking);
    }

    // A registration is expected: the install command carries a one-time token whose hash lives here
    // until the agent spends it. Re-issuable at any time (a reinstalled box registers again).
    expectRegistration(tokenHash: string, expiresAt: Date): void {
        this._registrationTokenHash = tokenHash;
        this._registrationTokenExpiresAt = expiresAt;
        this.touch();
    }

    // The agent's first contact: spends the registration token and brings the machine online with its
    // first facts. An ordered machine learns its address here (the operator named none).
    register(tokenHash: string, facts: MachineFacts, now: Date, policy: SlotCapacityPolicy): void {
        const expected = this._registrationTokenHash;
        const expiresAt = this._registrationTokenExpiresAt;

        if (!expected || expected !== tokenHash || !expiresAt || expiresAt < now) {
            throw new RegistrationTokenInvalidError();
        }
        this._registrationTokenHash = null;
        this._registrationTokenExpiresAt = null;
        if (this._fqdn === null && facts.address) {
            this._fqdn = facts.address;
        }
        this.applyFacts(facts, now, policy);
    }

    // Every check-in: fresh facts, fresh liveness. An offline machine that syncs again is online again.
    sync(facts: MachineFacts, now: Date, policy: SlotCapacityPolicy): void {
        this.applyFacts(facts, now, policy);
    }

    markOfflineIfSilent(criteria: SilentMachineCriteria): void {
        const predicate = criteria.toPredicate();

        if (this._state !== predicate.state || this._lastSyncAt === null) {
            return;
        }
        if (this._lastSyncAt < predicate.lastSyncBefore) {
            this._state = MachineState.Offline;
            this.touch();
        }
    }

    cordon(): void {
        this.transitionAdmission(MachineAdmission.Cordoned, [MachineAdmission.Open, MachineAdmission.Cordoned]);
    }

    uncordon(): void {
        this.transitionAdmission(MachineAdmission.Open, [MachineAdmission.Open, MachineAdmission.Cordoned]);
    }

    drain(): void {
        this.transitionAdmission(MachineAdmission.Draining, [
            MachineAdmission.Open,
            MachineAdmission.Cordoned,
            MachineAdmission.Draining,
        ]);
    }

    // Draining machines are forgotten the moment nothing holds them: a graceful detach.
    isDrained(): boolean {
        return this._admission === MachineAdmission.Draining && this._leaseId === null;
    }

    // The pool takes the machine for a lease. Only a ready, free machine may be taken — the claim query
    // already filters on the stored `ready` word, this is the aggregate's own word on it.
    claim(leaseId: string): void {
        if (this._leaseId === leaseId) {
            return;
        }
        if (this._leaseId !== null) {
            throw new MachineNotClaimableError(this.id, `already leased by ${this._leaseId}`);
        }
        if (!this.isReady()) {
            throw new MachineNotClaimableError(this.id, `not ready (${this._state}, ${this._admission})`);
        }
        this._leaseId = leaseId;
        this.touch();
    }

    release(): void {
        if (this._leaseId === null) {
            return;
        }
        this._leaseId = null;
        this.touch();
    }

    toObject(): MachineData {
        return {
            id: this.id,
            cloudAccountId: this.cloudAccountId,
            origin: this.origin,
            fqdn: this._fqdn,
            provides: this._provides.map((stereotype) => stereotype.toObject()),
            state: this._state,
            admission: this._admission,
            facts: this._facts?.toObject() ?? null,
            slotCapacityOverride: this._slotCapacityOverride,
            slotCapacity: this._slotCapacity,
            ready: this.isReady(),
            leaseId: this._leaseId,
            registrationTokenHash: this._registrationTokenHash,
            registrationTokenExpiresAt: this._registrationTokenExpiresAt,
            lastSyncAt: this._lastSyncAt,
            createdAt: this.createdAt,
            updatedAt: this._updatedAt,
        };
    }

    private applyFacts(facts: MachineFacts, now: Date, policy: SlotCapacityPolicy): void {
        this._facts = facts;
        this._slotCapacity = this._slotCapacityOverride ?? policy.capacityFor(facts.cores);
        this._state = MachineState.Online;
        this._lastSyncAt = now;
        this.touch();
    }

    private transitionAdmission(to: MachineAdmission, from: ReadonlyArray<MachineAdmission>): void {
        if (!from.includes(this._admission)) {
            throw new InvalidMachineAdmissionTransitionError(this.id, this._admission, to);
        }
        if (this._admission !== to) {
            this._admission = to;
            this.touch();
        }
    }

    private touch(): void {
        this._updatedAt = new Date();
    }
}
