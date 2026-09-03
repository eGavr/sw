import { Injectable } from "@nestjs/common";

import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { HostPoolExhaustedError } from "../../../domain/entities/host-pool/error/host-pool-exhausted-error";
import { HostPlacement, WorkloadLaunch } from "../../../domain/entities/host-pool/host-placement";
import { HostPoolKey } from "../../../domain/entities/host-pool/host-pool-key";
import { PoolHostProviderContext } from "../../../domain/entities/host-pool/pool-host";
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
// provisioning retry), else on the fullest machine with a free slot, else on a newly ordered one —
// within the pool's spend cap. The environment then just waits in `preparing` until its slot's agent
// registers it, exactly like every other compute path.
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

        const claimed = await this.poolHostRepository.withMostLoadedPlaceable(params.poolKey, (host) => {
            host.place(params.environmentId.getValue(), params.launch);
        });

        if (claimed) {
            return;
        }

        await this.orderNewHost(params);
    }

    // The cap check is a read-then-order (not a lock): concurrent placers can overshoot it by one
    // machine at worst, and the idle sweep returns the surplus — a bounded, self-healing overspend is
    // simpler than a cross-order lock.
    private async orderNewHost(params: PlaceWorkloadParams): Promise<HostPlacement> {
        const hosts = await this.poolHostRepository.countByPool(params.poolKey);

        if (hosts >= params.maxHosts) {
            throw new HostPoolExhaustedError(params.maxHosts);
        }

        const host = await this.poolHostRepository.create({
            poolKey: params.poolKey,
            capacitySlots: params.capacitySlots,
            providerContext: params.providerContext,
        });
        const placement = host.place(params.environmentId.getValue(), params.launch);

        await this.poolHostRepository.save(host);

        try {
            await this.hostProviderGateway.provision(host);
        } catch (error) {
            // The order never went out — drop the row so the pool does not count a phantom machine.
            await this.poolHostRepository.delete(PoolHostId.fromString(host.id)).catch(() => undefined);
            throw error;
        }

        return placement;
    }
}
