// One seat the machine agent should be running, in the machine context's words — the pool's own
// aggregate never crosses this port.
export type DesiredAssignment = {
    readonly environmentId: string;
    readonly slotIndex: number;
    readonly ports: { readonly wd: number; readonly appium: number; readonly console: number; readonly vnc: number };
    readonly launch: Record<string, unknown>;
};

// What a lease holds, for the machine's own surface (who occupies me).
export type LeaseDescription = {
    readonly bindingId: string;
    readonly environmentIds: ReadonlyArray<string>;
};

// Driven port of the machine context into the pool — the pool is an external system here. A machine
// that holds a lease reports its liveness on every sync and gets back what the lease wants running;
// null means the pool no longer knows the lease, so the machine is free again.
export abstract class MachinePoolGateway {
    abstract sync(leaseId: string, address: string | null): Promise<ReadonlyArray<DesiredAssignment> | null>;

    abstract describe(leaseId: string): Promise<LeaseDescription | null>;
}
