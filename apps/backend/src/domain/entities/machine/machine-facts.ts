import { InvalidArgumentError } from "../error/invalid-argument-error";

// How the machine can run guests: KVM on linux, Apple's hypervisor on macOS, or nothing usable (a VM
// without nested virtualisation) — what the android emulator stands or falls on.
export type Virtualization = "kvm" | "hvf" | "none";

export type MachineFactsData = {
    cores: number;
    memoryMb: number | null;
    virtualization: Virtualization;
    emulator: boolean;
    avds: ReadonlyArray<string>;
    docker: boolean;
    vncStack: boolean;
    agentVersion: string;
    // The address the agent sees itself at — adopted as the machine's address only when the operator
    // named none (an ordered machine), never over an operator-given FQDN.
    address: string | null;
};

// What the machine agent found on the box, reported verbatim on every sync: raw material for the
// domain's fitness judgement (conditions) and capacity arithmetic. Never called "capabilities" — that
// word is W3C's.
export class MachineFacts {
    static fromObject(data: MachineFactsData): MachineFacts {
        if (!Number.isInteger(data.cores) || data.cores < 1) {
            throw new InvalidArgumentError(`machine facts: cores must be a positive integer, got ${data.cores}`);
        }

        return new MachineFacts({
            ...data,
            avds: [...data.avds],
            memoryMb: data.memoryMb ?? null,
            address: data.address ?? null,
        });
    }

    private constructor(private readonly data: MachineFactsData) {}

    get cores(): number {
        return this.data.cores;
    }

    get virtualization(): Virtualization {
        return this.data.virtualization;
    }

    get emulator(): boolean {
        return this.data.emulator;
    }

    get docker(): boolean {
        return this.data.docker;
    }

    get vncStack(): boolean {
        return this.data.vncStack;
    }

    get address(): string | null {
        return this.data.address;
    }

    get agentVersion(): string {
        return this.data.agentVersion;
    }

    hasBaseAvd(): boolean {
        return this.data.avds.some((avd) => avd.startsWith("sw-android-"));
    }

    toObject(): MachineFactsData {
        return { ...this.data, avds: [...this.data.avds] };
    }
}
