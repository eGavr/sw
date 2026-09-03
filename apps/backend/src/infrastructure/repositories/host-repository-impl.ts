import { Injectable } from "@nestjs/common";

import { CreateHostParams, HostRepository } from "../../application/interfaces/repositories/host-repository";
import { EnvironmentId } from "../../domain/entities/environment/environment-id";
import { HostNotFoundError } from "../../domain/entities/host-pool/error/host-not-found-error";
import { Host } from "../../domain/entities/host-pool/host";
import { HostId } from "../../domain/entities/host-pool/host-id";
import { HostPoolKey } from "../../domain/entities/host-pool/host-pool-key";
import { placeableHostStates } from "../../domain/entities/host-pool/host-state";
import { HostDataSource } from "../data-sources/database/postgres/host-data-source";

@Injectable()
export class HostRepositoryImpl extends HostRepository {
    constructor(private readonly hostDataSource: HostDataSource) {
        super();
    }

    async create(params: CreateHostParams): Promise<Host> {
        const host = Host.create(params);

        await this.hostDataSource.create(host);

        return host;
    }

    async get(hostId: HostId): Promise<Host> {
        const data = await this.hostDataSource.findOne(hostId.getValue());

        if (!data) {
            throw new HostNotFoundError(hostId.getValue());
        }

        return Host.fromObject(data);
    }

    async findByEnvironment(environmentId: EnvironmentId): Promise<Host | null> {
        const data = await this.hostDataSource.findByEnvironment(environmentId.getValue());

        return data ? Host.fromObject(data) : null;
    }

    async with(hostId: HostId, mutate: (host: Host) => void): Promise<Host | null> {
        const data = await this.hostDataSource.withOne(hostId.getValue(), (row) => {
            const host = Host.fromObject(row);

            mutate(host);

            return host.toObject();
        });

        return data ? Host.fromObject(data) : null;
    }

    async withMostLoadedPlaceable(poolKey: HostPoolKey, mutate: (host: Host) => void): Promise<Host | null> {
        const data = await this.hostDataSource.withMostLoadedPlaceable(
            {
                cloudAccountId: poolKey.cloudAccountId,
                bindingId: poolKey.bindingId,
                states: placeableHostStates,
            },
            (row) => {
                const host = Host.fromObject(row);

                mutate(host);

                return host.toObject();
            },
        );

        return data ? Host.fromObject(data) : null;
    }

    async save(host: Host): Promise<void> {
        await this.hostDataSource.save(host);
    }

    async delete(hostId: HostId): Promise<void> {
        await this.hostDataSource.delete(hostId.getValue());
    }
}
