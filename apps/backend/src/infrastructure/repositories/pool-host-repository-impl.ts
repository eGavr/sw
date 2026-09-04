import { Injectable } from "@nestjs/common";

import { CreatePoolHostParams, PoolHostRepository } from "../../application/interfaces/repositories/pool-host-repository";
import { EnvironmentId } from "../../domain/entities/environment/environment-id";
import { PoolHostNotFoundError } from "../../domain/entities/host-pool/error/pool-host-not-found-error";
import { HostPoolKey } from "../../domain/entities/host-pool/host-pool-key";
import { PoolHost } from "../../domain/entities/host-pool/pool-host";
import { PoolHostId } from "../../domain/entities/host-pool/pool-host-id";
import { placeablePoolHostStates } from "../../domain/entities/host-pool/pool-host-state";
import { PoolHostDataSource } from "../data-sources/database/postgres/pool-host-data-source";

@Injectable()
export class PoolHostRepositoryImpl extends PoolHostRepository {
    constructor(private readonly poolHostDataSource: PoolHostDataSource) {
        super();
    }

    async create(params: CreatePoolHostParams): Promise<PoolHost> {
        const host = PoolHost.create(params);

        await this.poolHostDataSource.create(host);

        return host;
    }

    async get(hostId: PoolHostId): Promise<PoolHost> {
        const data = await this.poolHostDataSource.findOne(hostId.getValue());

        if (!data) {
            throw new PoolHostNotFoundError(hostId.getValue());
        }

        return PoolHost.fromObject(data);
    }

    async findByEnvironment(environmentId: EnvironmentId): Promise<PoolHost | null> {
        const data = await this.poolHostDataSource.findByEnvironment(environmentId.getValue());

        return data ? PoolHost.fromObject(data) : null;
    }

    async with(hostId: PoolHostId, mutate: (host: PoolHost) => void): Promise<PoolHost | null> {
        const data = await this.poolHostDataSource.withOne(hostId.getValue(), (row) => {
            const host = PoolHost.fromObject(row);

            mutate(host);

            return host.toObject();
        });

        return data ? PoolHost.fromObject(data) : null;
    }

    async placeOrCreate(
        poolKey: HostPoolKey,
        mutate: (host: PoolHost) => void,
        build: () => PoolHost,
        maxHosts: number,
    ): Promise<{ host: PoolHost; created: boolean } | null> {
        const result = await this.poolHostDataSource.placeOrCreate(
            {
                cloudAccountId: poolKey.cloudAccountId,
                bindingId: poolKey.bindingId,
                states: placeablePoolHostStates,
            },
            (row) => {
                const host = PoolHost.fromObject(row);

                mutate(host);

                return host.toObject();
            },
            () => build().toObject(),
            maxHosts,
        );

        return result ? { host: PoolHost.fromObject(result.data), created: result.created } : null;
    }

    async save(host: PoolHost): Promise<void> {
        await this.poolHostDataSource.save(host);
    }

    async delete(hostId: PoolHostId): Promise<void> {
        await this.poolHostDataSource.delete(hostId.getValue());
    }
}
