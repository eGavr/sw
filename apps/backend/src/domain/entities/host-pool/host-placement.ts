import { Uuid } from "../../types/uuid/uuid";

import { SlotPorts } from "./slot-ports";

// What the slot launcher on the host needs to start this workload (e.g. the AVD name and the internal
// callback URL for the in-slot agent). Opaque to the domain — the bridge that placed the workload wrote
// it, and the host agent hands it to the launcher verbatim; this is what keeps the pool generic across
// workload types.
export type WorkloadLaunch = Record<string, unknown>;

export type HostPlacementData = {
    id: string;
    environmentId: string;
    slotIndex: number;
    launch: WorkloadLaunch;
    createdAt: Date;
};

export type HostPlacementCreateParams = {
    environmentId: string;
    slotIndex: number;
    launch: WorkloadLaunch;
};

// One environment's seat on a pooled host. The slot index is the placement's identity on the machine:
// the launcher derives ports, AVD instance and unit name from it, so it never changes once assigned.
export class HostPlacement {
    static create(params: HostPlacementCreateParams): HostPlacement {
        return new HostPlacement(
            Uuid.create().getValue(),
            params.environmentId,
            params.slotIndex,
            params.launch,
            new Date(),
        );
    }

    static fromObject(data: HostPlacementData): HostPlacement {
        return new HostPlacement(data.id, data.environmentId, data.slotIndex, data.launch ?? {}, data.createdAt);
    }

    private constructor(
        readonly id: string,
        readonly environmentId: string,
        readonly slotIndex: number,
        private readonly _launch: WorkloadLaunch,
        readonly createdAt: Date,
    ) {}

    get launch(): WorkloadLaunch {
        return { ...this._launch };
    }

    ports(): SlotPorts {
        return SlotPorts.forIndex(this.slotIndex);
    }

    toObject(): HostPlacementData {
        return {
            id: this.id,
            environmentId: this.environmentId,
            slotIndex: this.slotIndex,
            launch: { ...this._launch },
            createdAt: this.createdAt,
        };
    }
}
