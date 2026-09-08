import { MachineLease } from "../../../../../../domain/entities/machine-pool/machine-lease";
import { SlotAssignment } from "../../../../../../domain/entities/machine-pool/slot-assignment";
import { Presenter } from "../../../../presenters/presenter";

// One desired seat, ready for the slot launcher: the assignment plus the per-environment agent token
// minted for this response (tokens are never stored).
export type DesiredSlot = {
    readonly assignment: SlotAssignment;
    readonly agentToken: string;
};

// The check-in's answer is the machine's desired state: the seats it should be running. The agent
// diffs them against its live slots (start the missing, stop the surplus). Ports travel explicitly —
// the control plane is the single owner of the slot-port contract, so a golden image never bakes the
// formula and can never drift from it.
export class LeaseHeartbeatPresenter implements Presenter {
    constructor(
        private readonly lease: MachineLease,
        private readonly slots: ReadonlyArray<DesiredSlot>,
    ) {}

    present(): object {
        return {
            uid: this.lease.id,
            state: this.lease.state,
            slots: this.slots.map(({ assignment, agentToken }) => {
                const ports = assignment.ports();

                return {
                    environmentId: assignment.environmentId,
                    slotIndex: assignment.slotIndex,
                    ports: { wd: ports.wd, appium: ports.appium, console: ports.console, vnc: ports.vnc },
                    launch: assignment.launch,
                    agentToken,
                };
            }),
        };
    }
}
