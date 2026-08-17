import { InvalidArgumentError } from "../error/invalid-argument-error";

// How an environment is executed — the substrate stereotype, orthogonal to the platform (what OS runs).
// A browser or a containerized Android (redroid) run in a `container`; the official QEMU image runs as an
// `emulator`; a real phone is a `device`. It is a first-class match attribute: a session addresses one
// substrate via the `sw:execution` capability, so an project may hold identical Android stereotypes on
// different substrates (redroid vs emulator) without ambiguity.
export enum Execution {
    Container = "container",
    Emulator = "emulator",
    Device = "device",
}

export const defaultExecution = Execution.Container;

export function toExecution(value: string): Execution {
    const execution = Object.values(Execution).find((candidate) => candidate === value);

    if (!execution) {
        throw new InvalidArgumentError(`environment execution: ${value}: unknown`);
    }

    return execution;
}
