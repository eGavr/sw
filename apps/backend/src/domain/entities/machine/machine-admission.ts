// The operator's intent for a machine: `open` = the pool may take it; `cordoned` = no new lease
// (maintenance, reversible); `draining` = being emptied for detach — no new lease, and once its
// current lease is released the machine is forgotten (irreversible, a graceful detach).
export enum MachineAdmission {
    Open = "open",
    Cordoned = "cordoned",
    Draining = "draining",
}
