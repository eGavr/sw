import { Injectable } from "@nestjs/common";

import {
    DesiredAssignment,
    LeaseDescription,
    MachinePoolGateway,
} from "../../../application/interfaces/gateways/machine-pool-gateway";
import { GetMachineLeaseUseCase } from "../../../application/use-cases/machine-pool/get-machine-lease-use-case";
import { RecordLeaseHeartbeatUseCase } from "../../../application/use-cases/machine-pool/record-lease-heartbeat-use-case";
import { MachineLeaseNotFoundError } from "../../../domain/entities/machine-pool/error/machine-lease-not-found-error";
import { MachineLease } from "../../../domain/entities/machine-pool/machine-lease";
import { MachineLeaseId } from "../../../domain/entities/machine-pool/machine-lease-id";

// The machine context's door into the pool, in-process: drives the pool's use cases the way a
// controller would and translates the pool's words (leases, assignments) into the machine's. A future
// split of the pool into its own service replaces this class with an HTTP client — nothing else moves.
@Injectable()
export class InProcessMachinePoolGateway extends MachinePoolGateway {
    constructor(
        private readonly recordLeaseHeartbeat: RecordLeaseHeartbeatUseCase,
        private readonly getMachineLease: GetMachineLeaseUseCase,
    ) {
        super();
    }

    async sync(leaseId: string, address: string | null): Promise<ReadonlyArray<DesiredAssignment> | null> {
        try {
            const lease = await this.recordLeaseHeartbeat.execute({
                leaseId: MachineLeaseId.fromString(leaseId),
                hostIp: address ?? "",
            });

            return toDesiredAssignments(lease);
        } catch (error) {
            if (error instanceof MachineLeaseNotFoundError) {
                return null;
            }
            throw error;
        }
    }

    async describe(leaseId: string): Promise<LeaseDescription | null> {
        const lease = await this.getMachineLease.execute({ leaseId: MachineLeaseId.fromString(leaseId) });

        return lease
            ? {
                bindingId: lease.poolKey.bindingId,
                environmentIds: lease.assignments().map((assignment) => assignment.environmentId),
            }
            : null;
    }
}

function toDesiredAssignments(lease: MachineLease): Array<DesiredAssignment> {
    return lease.assignments().map((assignment) => {
        const ports = assignment.ports();

        return {
            environmentId: assignment.environmentId,
            slotIndex: assignment.slotIndex,
            ports: { wd: ports.wd, appium: ports.appium, console: ports.console, vnc: ports.vnc },
            launch: assignment.launch,
        };
    });
}
