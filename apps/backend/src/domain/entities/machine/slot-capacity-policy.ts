import { InvalidArgumentError } from "../error/invalid-argument-error";

// How many cores one slot is worth — the install's policy that turns a machine's cores into its slot
// capacity (48 cores / 4 per emulator = 12), capped by the port contract's slot range.
export class SlotCapacityPolicy {
    constructor(readonly slotCores: number, readonly maxSlots: number) {
        if (!Number.isInteger(slotCores) || slotCores < 1) {
            throw new InvalidArgumentError(`slot capacity policy: cores per slot must be a positive integer, got ${slotCores}`);
        }
        if (!Number.isInteger(maxSlots) || maxSlots < 1) {
            throw new InvalidArgumentError(`slot capacity policy: max slots must be a positive integer, got ${maxSlots}`);
        }
    }

    capacityFor(cores: number): number {
        return Math.max(1, Math.min(this.maxSlots, Math.floor(cores / this.slotCores)));
    }
}
