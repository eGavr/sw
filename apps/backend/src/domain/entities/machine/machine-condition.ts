import { Stereotype } from "../cloud-account/stereotype";
import { Execution } from "../environment/execution";

import { MachineFacts } from "./machine-facts";

// One judgement about the machine's fitness for what it provides (k8s node conditions, simplified):
// `blocking` says whether the pool must not lease it (no way to run the stereotype) or the machine
// merely degrades (sessions work, a side feature does not).
export type MachineCondition = {
    readonly type: string;
    readonly blocking: boolean;
    readonly message: string;
};

// The fitness rules per stereotype, computed from the agent's facts — the domain judges, the agent
// only reports. No facts yet (the agent never synced) means no judgement at all.
export function judgeConditions(provides: ReadonlyArray<Stereotype>, facts: MachineFacts | null): Array<MachineCondition> {
    if (!facts) {
        return [];
    }

    const conditions: Array<MachineCondition> = [];
    const emulatorStereotype = provides.some((stereotype) => stereotype.execution === Execution.Emulator);
    const containerStereotype = provides.some((stereotype) => stereotype.execution === Execution.Container);

    if (emulatorStereotype && facts.virtualization === "none") {
        conditions.push({
            type: "VirtualizationMissing",
            blocking: true,
            message: "no hardware virtualization (/dev/kvm or the Apple hypervisor): the android emulator cannot run",
        });
    }
    if (emulatorStereotype && !facts.emulator) {
        conditions.push({ type: "EmulatorMissing", blocking: true, message: "the android emulator is not installed" });
    }
    if (emulatorStereotype && facts.emulator && !facts.hasBaseAvd()) {
        conditions.push({
            type: "BaseAvdMissing",
            blocking: true,
            message: "no base AVD named sw-android-<version> is baked on the machine",
        });
    }
    if (containerStereotype && !facts.docker) {
        conditions.push({ type: "DockerMissing", blocking: true, message: "docker is not installed" });
    }
    // The machine's own VNC pipeline serves emulator slots (scrcpy off the device); a container slot
    // carries its display inside the image, so a browser-only box is not judged on it.
    if (emulatorStereotype && !facts.vncStack) {
        conditions.push({
            type: "VncStackMissing",
            blocking: false,
            message: "no VNC pipeline (scrcpy/xvfb/x11vnc/websockify or the sidecar image): sessions run, Live-VNC stays empty",
        });
    }

    return conditions;
}
