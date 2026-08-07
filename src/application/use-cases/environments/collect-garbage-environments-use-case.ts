import { Injectable } from "@nestjs/common";

import { GarbageCollectionCriteria } from "../../../domain/entities/environment/garbage-collection-criteria";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";

export type CollectGarbageEnvironmentsParams = {
    readonly freshnessMs: number;
    readonly failedTtlMs: number;
};

// GC scenario: hard-delete environments that are done — `deleting` ones whose container is gone
// (heartbeat stale/absent) and `failed` ones past their TTL — so the table does not grow. Division of
// labour: the worker stops containers, the GC removes rows; the agent never deletes.
@Injectable()
export class CollectGarbageEnvironmentsUseCase {
    constructor(private readonly environmentRepository: EnvironmentRepository) {}

    async execute(params: CollectGarbageEnvironmentsParams): Promise<void> {
        const criteria = GarbageCollectionCriteria.from(new Date(), {
            freshnessMs: params.freshnessMs,
            failedTtlMs: params.failedTtlMs,
        });

        await this.environmentRepository.collectGarbage(criteria);
    }
}
