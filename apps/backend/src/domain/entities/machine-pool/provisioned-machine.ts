// What the cloud handed the pool for a lease: which machine, and how many slots it can seat. The pool
// vocabulary's view of a machine — the machine context's aggregate never crosses this port.
export type ProvisionedMachine = {
    readonly machineId: string;
    readonly slotCapacity: number;
};
