import { Injectable } from "@nestjs/common";

import { CreateMachineLeaseParams, MachineLeaseRepository } from "../../application/interfaces/repositories/machine-lease-repository";
import { EnvironmentId } from "../../domain/entities/environment/environment-id";
import { MachineLeaseNotFoundError } from "../../domain/entities/machine-pool/error/machine-lease-not-found-error";
import { MachineLease } from "../../domain/entities/machine-pool/machine-lease";
import { MachineLeaseId } from "../../domain/entities/machine-pool/machine-lease-id";
import { placeableMachineLeaseStates } from "../../domain/entities/machine-pool/machine-lease-state";
import { MachinePoolKey } from "../../domain/entities/machine-pool/machine-pool-key";
import { PoolLimits } from "../../domain/entities/machine-pool/pool-limits";
import { MachineLeaseDataSource } from "../data-sources/database/postgres/machine-lease-data-source";

@Injectable()
export class MachineLeaseRepositoryImpl extends MachineLeaseRepository {
    constructor(private readonly machineLeaseDataSource: MachineLeaseDataSource) {
        super();
    }

    async create(params: CreateMachineLeaseParams): Promise<MachineLease> {
        const lease = MachineLease.create(params);

        await this.machineLeaseDataSource.create(lease);

        return lease;
    }

    async get(leaseId: MachineLeaseId): Promise<MachineLease> {
        const data = await this.machineLeaseDataSource.findOne(leaseId.getValue());

        if (!data) {
            throw new MachineLeaseNotFoundError(leaseId.getValue());
        }

        return MachineLease.fromObject(data);
    }

    async find(leaseId: MachineLeaseId): Promise<MachineLease | null> {
        const data = await this.machineLeaseDataSource.findOne(leaseId.getValue());

        return data ? MachineLease.fromObject(data) : null;
    }

    async findByEnvironment(environmentId: EnvironmentId): Promise<MachineLease | null> {
        const data = await this.machineLeaseDataSource.findByEnvironment(environmentId.getValue());

        return data ? MachineLease.fromObject(data) : null;
    }

    async with(leaseId: MachineLeaseId, mutate: (lease: MachineLease) => void): Promise<MachineLease | null> {
        const data = await this.machineLeaseDataSource.withOne(leaseId.getValue(), (row) => {
            const lease = MachineLease.fromObject(row);

            mutate(lease);

            return lease.toObject();
        });

        return data ? MachineLease.fromObject(data) : null;
    }

    async placeOrCreate(
        poolKey: MachinePoolKey,
        environmentId: EnvironmentId,
        mutate: (lease: MachineLease) => void,
        build: () => MachineLease,
        limits: PoolLimits,
    ): Promise<{ lease: MachineLease; created: boolean } | null> {
        const result = await this.machineLeaseDataSource.placeOrCreate(
            {
                cloudAccountId: poolKey.cloudAccountId,
                bindingId: poolKey.bindingId,
                states: placeableMachineLeaseStates,
                environmentId: environmentId.getValue(),
            },
            (row) => {
                const lease = MachineLease.fromObject(row);

                mutate(lease);

                return lease.toObject();
            },
            () => build().toObject(),
            limits,
        );

        return result ? { lease: MachineLease.fromObject(result.data), created: result.created } : null;
    }

    async listAll(): Promise<Array<MachineLease>> {
        const data = await this.machineLeaseDataSource.findAll();

        return data.map(MachineLease.fromObject);
    }

    async save(lease: MachineLease): Promise<void> {
        await this.machineLeaseDataSource.save(lease);
    }

    async delete(leaseId: MachineLeaseId): Promise<void> {
        await this.machineLeaseDataSource.delete(leaseId.getValue());
    }
}
