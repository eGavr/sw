import { Injectable } from "@nestjs/common";

import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { StaleReservationCriteria } from "../../../domain/entities/environment/stale-reservation-criteria";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";

export type ReleaseStaleReservationsParams = {
    readonly stalenessMs: number;
};

// Sweep scenario: a reserved environment whose reserving wd stopped heartbeating died mid-create —
// nobody will ever occupy or release it, so the sweep returns it to the pool. Each release re-checks
// under the storage lock (`with`): a reservation that got occupied or released between the listing and
// the lock is left alone (the domain guard refuses, and that refusal is the correct outcome).
@Injectable()
export class ReleaseStaleReservationsUseCase {
    constructor(private readonly environmentRepository: EnvironmentRepository) {}

    async execute(params: ReleaseStaleReservationsParams): Promise<void> {
        const criteria = StaleReservationCriteria.from(new Date(), params.stalenessMs);
        const stale = await this.environmentRepository.listStaleReservations(criteria);

        await Promise.all(stale.map((environment) => this.release(environment)));
    }

    private async release(environment: Environment): Promise<void> {
        await this.environmentRepository
            .with(EnvironmentId.fromString(environment.id), (reserved) => reserved.releaseReservation())
            .catch(() => undefined);
    }
}
