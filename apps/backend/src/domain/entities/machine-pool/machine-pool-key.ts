// Which pool a host belongs to: one pool per compute binding, so hosts are never shared across
// bindings — and therefore never across projects (isolation boundary = the binding's cloud folder).
export class MachinePoolKey {
    constructor(
        readonly cloudAccountId: string,
        readonly bindingId: string,
    ) {}

    equals(other: MachinePoolKey): boolean {
        return this.cloudAccountId === other.cloudAccountId && this.bindingId === other.bindingId;
    }
}
