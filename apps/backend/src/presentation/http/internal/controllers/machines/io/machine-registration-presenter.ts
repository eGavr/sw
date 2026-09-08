import { Machine } from "../../../../../../domain/entities/machine/machine";
import { Presenter } from "../../../../presenters/presenter";

// The registration's answer: the machine's identity and the long-lived token the agent syncs with
// from now on (shown here once; the agent keeps it on the box).
export class MachineRegistrationPresenter implements Presenter {
    constructor(
        private readonly machine: Machine,
        private readonly machineToken: string,
    ) {}

    present(): object {
        return {
            uid: this.machine.id,
            state: this.machine.state,
            machineToken: this.machineToken,
        };
    }
}
