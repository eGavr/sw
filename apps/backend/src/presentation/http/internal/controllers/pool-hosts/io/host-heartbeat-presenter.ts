import { HostPlacement } from "../../../../../../domain/entities/host-pool/host-placement";
import { PoolHost } from "../../../../../../domain/entities/host-pool/pool-host";
import { Presenter } from "../../../../presenters/presenter";

// One desired seat, ready for the slot launcher: the placement plus the per-environment agent token
// minted for this response (tokens are never stored).
export type DesiredSlot = {
    readonly placement: HostPlacement;
    readonly agentToken: string;
};

// The check-in's answer is the machine's desired state: the seats it should be running. The agent
// diffs them against its live slots (start the missing, stop the surplus). Ports travel explicitly —
// the control plane is the single owner of the slot-port contract, so a golden image never bakes the
// formula and can never drift from it.
export class HostHeartbeatPresenter implements Presenter {
    constructor(
        private readonly host: PoolHost,
        private readonly slots: ReadonlyArray<DesiredSlot>,
    ) {}

    present(): object {
        return {
            uid: this.host.id,
            state: this.host.state,
            slots: this.slots.map(({ placement, agentToken }) => {
                const ports = placement.ports();

                return {
                    environmentId: placement.environmentId,
                    slotIndex: placement.slotIndex,
                    ports: { wd: ports.wd, appium: ports.appium, console: ports.console },
                    launch: placement.launch,
                    agentToken,
                };
            }),
        };
    }
}
