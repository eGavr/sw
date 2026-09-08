import { Machine } from "../../../domain/entities/machine/machine";
import { LeaseDescription } from "../../interfaces/gateways/machine-pool-gateway";

// A machine together with what the pool holds on it — the read shape of every machine scenario, so
// the surface can say "leased for these environments" without reaching into the pool itself.
export type MachineView = {
    readonly machine: Machine;
    readonly lease: LeaseDescription | null;
};
