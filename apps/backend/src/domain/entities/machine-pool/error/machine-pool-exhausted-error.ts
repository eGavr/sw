import { ResourceExhaustedError } from "../../error/resource-exhausted-error";

// Every leased machine is full and no more can be had — the pool's cap or the cloud's headroom is spent.
// A capacity limit, not a broken request: RESOURCE_EXHAUSTED (429), so clients back off and retry later.
export class MachinePoolExhaustedError extends ResourceExhaustedError {
    constructor(maxLeases: number) {
        super(`machine pool: every machine is full and no more can be leased (cap ${maxLeases})`);
    }
}
