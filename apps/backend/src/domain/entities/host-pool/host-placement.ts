import { Uuid } from "../../types/uuid/uuid";

import { SlotPorts } from "./slot-ports";

export type HostPlacementData = {
    id: string;
    environmentId: string;
    slotIndex: number;
    createdAt: Date;
};

export type HostPlacementCreateParams = {
    environmentId: string;
    slotIndex: number;
};

// One environment's seat on a pooled host. The slot index is the placement's identity on the machine:
// the launcher derives ports, AVD instance and unit name from it, so it never changes once assigned.
export class HostPlacement {
    static create(params: HostPlacementCreateParams): HostPlacement {
        return new HostPlacement(Uuid.create().getValue(), params.environmentId, params.slotIndex, new Date());
    }

    static fromObject(data: HostPlacementData): HostPlacement {
        return new HostPlacement(data.id, data.environmentId, data.slotIndex, data.createdAt);
    }

    private constructor(
        readonly id: string,
        readonly environmentId: string,
        readonly slotIndex: number,
        readonly createdAt: Date,
    ) {}

    ports(): SlotPorts {
        return SlotPorts.forIndex(this.slotIndex);
    }

    toObject(): HostPlacementData {
        return {
            id: this.id,
            environmentId: this.environmentId,
            slotIndex: this.slotIndex,
            createdAt: this.createdAt,
        };
    }
}
