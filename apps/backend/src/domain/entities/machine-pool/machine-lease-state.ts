// Lifecycle of a lease: `enqueued` = the seat was taken synchronously at create-environment time and
// the machine is not asked for yet (the worker does that); `ordering` = the machine is requested from
// the cloud (or taken from the inventory), waiting for its agent to check in; `ready` = the agent
// syncs and slots can run; `deleting` = chosen for return to the cloud; `failed` = went silent — its
// workloads die on their own (the environments' own reapers), and once empty the machine is returned.
export enum MachineLeaseState {
    Enqueued = "enqueued",
    Ordering = "ordering",
    Ready = "ready",
    Deleting = "deleting",
    Failed = "failed",
}

// States that accept new assignments. `ordering` is placeable on purpose: environments queue onto the
// machine that is still booting instead of ordering another expensive one. An `enqueued` lease seats
// exactly the environment that created it — its capacity is unknown until a machine is provisioned.
export const placeableMachineLeaseStates: ReadonlyArray<MachineLeaseState> = [
    MachineLeaseState.Enqueued,
    MachineLeaseState.Ordering,
    MachineLeaseState.Ready,
];
