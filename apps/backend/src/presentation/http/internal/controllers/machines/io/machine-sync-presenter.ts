import { DesiredAssignment } from "../../../../../../application/interfaces/gateways/machine-pool-gateway";
import { Machine } from "../../../../../../domain/entities/machine/machine";
import { Presenter } from "../../../../presenters/presenter";

// One desired seat, ready for the slot launcher: the assignment plus the per-environment agent token
// minted for this response (tokens are never stored).
export type DesiredSlot = {
    readonly assignment: DesiredAssignment;
    readonly agentToken: string;
};

// The sync's answer is the machine's desired state: the seats it should be running. The agent diffs
// them against its live slots (start the missing, stop the surplus). Ports travel explicitly — the
// control plane is the single owner of the slot-port contract, so no image bakes the formula.
export class MachineSyncPresenter implements Presenter {
    constructor(
        private readonly machine: Machine,
        private readonly slots: ReadonlyArray<DesiredSlot>,
    ) {}

    present(): object {
        return {
            uid: this.machine.id,
            state: this.machine.state,
            admission: this.machine.admission,
            assignments: this.slots.map(({ assignment, agentToken }) => ({
                environmentId: assignment.environmentId,
                slotIndex: assignment.slotIndex,
                ports: assignment.ports,
                launch: assignment.launch,
                agentToken,
            })),
        };
    }
}
