import { Injectable } from "@nestjs/common";

import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { HostPoolExhaustedError } from "../../../domain/entities/host-pool/error/host-pool-exhausted-error";
import { WorkloadLaunch } from "../../../domain/entities/host-pool/host-placement";
import { HostPoolKey } from "../../../domain/entities/host-pool/host-pool-key";
import { PoolHost, PoolHostProviderContext } from "../../../domain/entities/host-pool/pool-host";
import { PoolHostId } from "../../../domain/entities/host-pool/pool-host-id";
import { HostProviderGateway } from "../../interfaces/gateways/host-provider-gateway";
import { PoolHostRepository } from "../../interfaces/repositories/pool-host-repository";

export type PlaceWorkloadParams = {
    readonly environmentId: EnvironmentId;
    readonly poolKey: HostPoolKey;
    readonly capacitySlots: number;
    readonly maxHosts: number;
    readonly providerContext: PoolHostProviderContext;
    readonly launch: WorkloadLaunch;
};

// Seat an environment somewhere in its binding's pool: on the machine already holding its seat (a
// provisioning retry), else on the fullest machine with a free slot, else on a newly built one —
// atomically, serialised per pool, so concurrent placers (N workers) can never order surplus
// machines or breach the spend cap. Only a freshly built machine is actually ordered from the cloud;
// the environment then waits in `preparing` until its slot's agent registers it, exactly like every
// other compute path.
@Injectable()
export class PlaceWorkloadUseCase {
    constructor(
        private readonly poolHostRepository: PoolHostRepository,
        private readonly hostProviderGateway: HostProviderGateway,
    ) {}

    async execute(params: PlaceWorkloadParams): Promise<void> {
        if (await this.poolHostRepository.findByEnvironment(params.environmentId)) {
            return;
        }

        const environmentId = params.environmentId.getValue();

        const seated = await this.poolHostRepository.placeOrCreate(
            params.poolKey,
            (host) => {
                host.place(environmentId, params.launch);
            },
            () => {
                const host = PoolHost.create({
                    poolKey: params.poolKey,
                    capacitySlots: params.capacitySlots,
                    providerContext: params.providerContext,
                });

                host.place(environmentId, params.launch);

                return host;
            },
            params.maxHosts,
        );

        if (!seated) {
            throw new HostPoolExhaustedError(params.maxHosts);
        }

        if (!seated.created) {
            return;
        }

        try {
            await this.hostProviderGateway.provision(seated.host);
        } catch (error) {
            // The order never went out — drop the row so the pool does not count a phantom machine.
            // A rival seated here between our commit and this delete loses its placement with the row;
            // its environment re-enters the queue via the preparing reclaim and is seated afresh.
            await this.poolHostRepository.delete(PoolHostId.fromString(seated.host.id)).catch(() => undefined);
            throw error;
        }
    }
}
