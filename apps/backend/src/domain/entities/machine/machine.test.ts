import { Uuid } from "../../types/uuid/uuid";
import { Stereotype } from "../cloud-account/stereotype";
import { Execution } from "../environment/execution";
import { InvalidArgumentError } from "../error/invalid-argument-error";

import { InvalidMachineAdmissionTransitionError } from "./error/invalid-machine-admission-transition-error";
import { MachineNotClaimableError } from "./error/machine-not-claimable-error";
import { RegistrationTokenInvalidError } from "./error/registration-token-invalid-error";
import { Machine } from "./machine";
import { MachineAdmission } from "./machine-admission";
import { MachineFacts, MachineFactsData } from "./machine-facts";
import { MachineOrigin } from "./machine-origin";
import { MachineState } from "./machine-state";
import { SilentMachineCriteria } from "./silent-machine-criteria";
import { SlotCapacityPolicy } from "./slot-capacity-policy";

const androidEmulator = new Stereotype("android", Execution.Emulator);
const ubuntuContainer = new Stereotype("ubuntu", Execution.Container);
const policy = new SlotCapacityPolicy(4, 16);
const now = new Date("2026-09-08T12:00:00Z");

function attach(overrides: Partial<Parameters<typeof Machine.attach>[0]> = {}): Machine {
    return Machine.attach({
        cloudAccountId: Uuid.create().getValue(),
        origin: MachineOrigin.Attached,
        fqdn: "box-1.lab",
        provides: [androidEmulator],
        ...overrides,
    });
}

function facts(overrides: Partial<MachineFactsData> = {}): MachineFacts {
    return MachineFacts.fromObject({
        cores: 48,
        memoryMb: 131072,
        virtualization: "kvm",
        emulator: true,
        avds: ["sw-android-14"],
        docker: true,
        vncStack: true,
        agentVersion: "1",
        address: "10.0.0.7",
        ...overrides,
    });
}

function registered(machine: Machine, reported = facts()): Machine {
    machine.expectRegistration("hash", new Date(now.getTime() + 60_000));
    machine.register("hash", reported, now, policy);

    return machine;
}

describe("Machine", () => {
    test("must provide at least one stereotype and a sane capacity override", () => {
        expect(() => attach({ provides: [] })).toThrow(InvalidArgumentError);
        expect(() => attach({ slotCapacityOverride: 0 })).toThrow(InvalidArgumentError);
    });

    test("is pending, open and not ready until its agent registers", () => {
        const machine = attach();

        expect(machine.state).toBe(MachineState.Pending);
        expect(machine.admission).toBe(MachineAdmission.Open);
        expect(machine.isReady()).toBe(false);
        expect(machine.conditions()).toEqual([]);
        expect(machine.slotCapacity).toBeNull();
    });

    describe("registration", () => {
        test("spends the expected token, comes online with facts and a capacity from the policy", () => {
            const machine = registered(attach());

            expect(machine.state).toBe(MachineState.Online);
            expect(machine.slotCapacity).toBe(12);
            expect(machine.isReady()).toBe(true);
            expect(machine.toObject().registrationTokenHash).toBeNull();
        });

        test("refuses an unknown, spent or expired token", () => {
            const machine = attach();

            expect(() => machine.register("hash", facts(), now, policy)).toThrow(RegistrationTokenInvalidError);

            machine.expectRegistration("hash", new Date(now.getTime() + 60_000));
            expect(() => machine.register("other", facts(), now, policy)).toThrow(RegistrationTokenInvalidError);

            machine.register("hash", facts(), now, policy);
            expect(() => machine.register("hash", facts(), now, policy)).toThrow(RegistrationTokenInvalidError);

            machine.expectRegistration("late", new Date(now.getTime() - 1));
            expect(() => machine.register("late", facts(), now, policy)).toThrow(RegistrationTokenInvalidError);
        });

        test("an ordered machine learns its address from the agent; an attached one keeps the operator's", () => {
            const ordered = registered(attach({ origin: MachineOrigin.Ordered, fqdn: null }));
            const attached = registered(attach());

            expect(ordered.fqdn).toBe("10.0.0.7");
            expect(attached.fqdn).toBe("box-1.lab");
        });

        test("an operator's capacity override beats the cores arithmetic", () => {
            const machine = registered(attach({ slotCapacityOverride: 3 }));

            expect(machine.slotCapacity).toBe(3);
        });
    });

    describe("fitness", () => {
        test("no virtualization blocks an emulator machine; a missing VNC stack only degrades it", () => {
            const machine = registered(attach(), facts({ virtualization: "none", vncStack: false }));

            expect(machine.conditions().map((condition) => [condition.type, condition.blocking])).toEqual([
                ["VirtualizationMissing", true],
                ["VncStackMissing", false],
            ]);
            expect(machine.isReady()).toBe(false);
        });

        test("a container machine needs docker, not an emulator", () => {
            const machine = registered(
                attach({ provides: [ubuntuContainer] }),
                facts({ emulator: false, avds: [], docker: false }),
            );

            expect(machine.conditions().map((condition) => condition.type)).toEqual(["DockerMissing"]);
        });

        test("an emulator machine without a base AVD is not ready", () => {
            const machine = registered(attach(), facts({ avds: ["Pixel_7_API_34"] }));

            expect(machine.conditions().map((condition) => condition.type)).toEqual(["BaseAvdMissing"]);
            expect(machine.isReady()).toBe(false);
        });
    });

    describe("claims", () => {
        test("a ready, free machine is claimed; a claim is idempotent per lease", () => {
            const machine = registered(attach());
            const leaseId = Uuid.create().getValue();

            machine.claim(leaseId);
            machine.claim(leaseId);

            expect(machine.leaseId).toBe(leaseId);
            expect(() => machine.claim(Uuid.create().getValue())).toThrow(MachineNotClaimableError);
        });

        test("a pending, cordoned or unfit machine cannot be claimed", () => {
            expect(() => attach().claim("lease")).toThrow(MachineNotClaimableError);

            const cordoned = registered(attach());
            cordoned.cordon();
            expect(() => cordoned.claim("lease")).toThrow(MachineNotClaimableError);

            const unfit = registered(attach(), facts({ emulator: false }));
            expect(() => unfit.claim("lease")).toThrow(MachineNotClaimableError);
        });

        test("release frees the machine; a draining machine released is drained", () => {
            const machine = registered(attach());

            machine.claim("lease");
            machine.drain();
            expect(machine.isDrained()).toBe(false);

            machine.release();
            expect(machine.leaseId).toBeNull();
            expect(machine.isDrained()).toBe(true);
        });
    });

    describe("admission", () => {
        test("cordon is reversible, drain is not", () => {
            const machine = registered(attach());

            machine.cordon();
            expect(machine.isReady()).toBe(false);
            machine.uncordon();
            expect(machine.isReady()).toBe(true);

            machine.drain();
            expect(() => machine.uncordon()).toThrow(InvalidMachineAdmissionTransitionError);
            expect(() => machine.cordon()).toThrow(InvalidMachineAdmissionTransitionError);
            expect(machine.admission).toBe(MachineAdmission.Draining);
        });
    });

    describe("silence", () => {
        test("an online machine silent past the allowance goes offline, and syncs back online", () => {
            const machine = registered(attach());
            const later = new Date(now.getTime() + 120_000);

            machine.markOfflineIfSilent(SilentMachineCriteria.from(later, 60_000));
            expect(machine.state).toBe(MachineState.Offline);
            expect(machine.isReady()).toBe(false);

            machine.sync(facts(), later, policy);
            expect(machine.state).toBe(MachineState.Online);
            expect(machine.isReady()).toBe(true);
        });

        test("a pending machine is never written offline — it has not spoken yet", () => {
            const machine = attach();

            machine.markOfflineIfSilent(SilentMachineCriteria.from(new Date(now.getTime() + 999_999), 1));
            expect(machine.state).toBe(MachineState.Pending);
        });
    });

    test("round-trips through its data shape with the derived ready word", () => {
        const machine = registered(attach());
        const copy = Machine.fromObject(machine.toObject());

        expect(copy.toObject()).toEqual(machine.toObject());
        expect(copy.toObject().ready).toBe(true);
    });
});
