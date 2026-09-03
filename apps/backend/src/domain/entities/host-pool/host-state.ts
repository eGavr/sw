// Lifecycle of a pooled host: `ordering` = requested from the cloud, waiting for its agent to check
// in; `ready` = the agent polls and slots can run; `deleting` = chosen for return to the cloud;
// `failed` = went silent — its workloads die on their own (the environments' own reapers), and once
// empty the host is returned to the cloud.
export enum HostState {
    Ordering = "ordering",
    Ready = "ready",
    Deleting = "deleting",
    Failed = "failed",
}

// States that accept new placements. `ordering` is placeable on purpose: environments queue onto the
// host that is still booting instead of ordering another expensive machine.
export const placeableHostStates: ReadonlyArray<HostState> = [HostState.Ordering, HostState.Ready];
