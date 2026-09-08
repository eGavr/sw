import { MachineView } from "../../../../../../application/use-cases/machines/machine-view";
import { CloudAccount } from "../../../../../../domain/entities/cloud-account/cloud-account";
import { Presenter } from "../../../../presenters/presenter";

// A machine on the wire: identity, address, what it serves, the three axes (connectivity, the
// operator's intent, fitness) plus the derived `ready`, its slots, and who holds it. The lease is
// shown by what it means to the user (the binding and the environments), never as an internal row.
export class MachinePresenter implements Presenter {
    constructor(
        private readonly view: MachineView,
        private readonly cloudAccount: CloudAccount,
    ) {}

    present(): object {
        const { machine, lease } = this.view;
        const project = this.cloudAccount.projectId.getValue();
        const account = `projects/${project}/cloudAccounts/${this.cloudAccount.id}`;
        const facts = machine.facts?.toObject() ?? null;

        return {
            name: `${account}/machines/${machine.id}`,
            uid: machine.id,
            origin: machine.origin,
            fqdn: machine.fqdn,
            provides: machine.provides().map((stereotype) => ({
                platform: stereotype.platformName,
                execution: stereotype.execution,
            })),
            state: machine.state,
            admission: machine.admission,
            ready: machine.isReady(),
            conditions: machine.conditions().map((condition) => ({
                type: condition.type,
                blocking: condition.blocking,
                message: condition.message,
            })),
            facts: facts
                ? {
                    cores: facts.cores,
                    memoryMb: facts.memoryMb,
                    virtualization: facts.virtualization,
                    emulator: facts.emulator,
                    avds: facts.avds,
                    docker: facts.docker,
                    vncStack: facts.vncStack,
                    agentVersion: facts.agentVersion,
                }
                : null,
            slotCapacity: machine.slotCapacity,
            lease: lease
                ? {
                    computeBinding: `${account}/computeBindings/${lease.bindingId}`,
                    environments: lease.environmentIds.map((id) => `projects/${project}/environments/${id}`),
                }
                : null,
            lastSyncTime: machine.lastSyncAt?.toISOString() ?? null,
            createTime: machine.createdAt.toISOString(),
        };
    }
}
