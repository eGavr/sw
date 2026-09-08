// What bounds new leases at seating time: the pool's own cap on leases, and — for a cloud whose
// machines are counted — how many leases may still be waiting for a machine (a lease waiting for one is
// a machine spoken for). The two live at different scopes: the cap belongs to the binding's quota, the
// waiting budget to the account's inventory, which every binding of that account draws from. Both are
// checked under the account lock, so no two placers can spend the same machine or breach the cap.
export type PoolLimits = {
    readonly maxLeases: number;
    // null = the cloud hands out machines on demand; only maxLeases bounds the pool.
    readonly maxAwaitingMachine: number | null;
};
