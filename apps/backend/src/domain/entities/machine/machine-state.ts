// Connectivity of a machine — a fact the agent's check-ins establish, never a judgement: `pending` =
// attached but its agent has not registered yet; `online` = the agent syncs; `offline` = the agent went
// silent past the allowance (the machine may be dead, unplugged, or just rebooting — it comes back to
// `online` by itself on the next sync). Fitness for its stereotypes is a separate axis (conditions),
// so is the operator's intent (admission).
export enum MachineState {
    Pending = "pending",
    Online = "online",
    Offline = "offline",
}
