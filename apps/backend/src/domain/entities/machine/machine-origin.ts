// How a machine entered the inventory: attached by the user (their own box, kept until they detach
// it) or ordered by us from a cloud on the pool's behalf (lives exactly as long as its lease).
export enum MachineOrigin {
    Attached = "attached",
    Ordered = "ordered",
}
