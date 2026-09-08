import { Injectable } from "@nestjs/common";

import { MachineRepository } from "../../application/interfaces/repositories/machine-repository";
import { MachineNotFoundError } from "../../domain/entities/machine/error/machine-not-found-error";
import { FreeMachineCriteria } from "../../domain/entities/machine/free-machine-criteria";
import { Machine } from "../../domain/entities/machine/machine";
import { MachineId } from "../../domain/entities/machine/machine-id";
import { MachineDataSource } from "../data-sources/database/postgres/machine-data-source";

@Injectable()
export class MachineRepositoryImpl extends MachineRepository {
    constructor(private readonly machineDataSource: MachineDataSource) {
        super();
    }

    async create(machine: Machine): Promise<void> {
        await this.machineDataSource.create(machine);
    }

    async get(machineId: MachineId): Promise<Machine> {
        const machine = await this.find(machineId);

        if (!machine) {
            throw new MachineNotFoundError(machineId.getValue());
        }

        return machine;
    }

    async find(machineId: MachineId): Promise<Machine | null> {
        const data = await this.machineDataSource.findOne(machineId.getValue());

        return data ? Machine.fromObject(data) : null;
    }

    async findByLease(leaseId: string): Promise<Machine | null> {
        const data = await this.machineDataSource.findByLease(leaseId);

        return data ? Machine.fromObject(data) : null;
    }

    async listByCloudAccount(cloudAccountId: string): Promise<Array<Machine>> {
        return (await this.machineDataSource.findByCloudAccount(cloudAccountId)).map(Machine.fromObject);
    }

    async listAll(): Promise<Array<Machine>> {
        return (await this.machineDataSource.findAll()).map(Machine.fromObject);
    }

    async listLeaseIds(cloudAccountId: string): Promise<Array<string>> {
        return this.machineDataSource.findLeaseIds(cloudAccountId);
    }

    async countFree(criteria: FreeMachineCriteria): Promise<number> {
        return this.machineDataSource.countFree(criteria.toPredicate());
    }

    async findNextFree(criteria: FreeMachineCriteria): Promise<Machine | null> {
        const data = await this.machineDataSource.findNextFree(criteria.toPredicate());

        return data ? Machine.fromObject(data) : null;
    }

    async with(machineId: MachineId, mutate: (machine: Machine) => void): Promise<Machine | null> {
        const data = await this.machineDataSource.withOne(machineId.getValue(), (row) => {
            const machine = Machine.fromObject(row);

            mutate(machine);

            return machine.toObject();
        });

        return data ? Machine.fromObject(data) : null;
    }

    async withFreeMachine(criteria: FreeMachineCriteria, mutate: (machine: Machine) => void): Promise<Machine | null> {
        const data = await this.machineDataSource.withFree(criteria.toPredicate(), (row) => {
            const machine = Machine.fromObject(row);

            mutate(machine);

            return machine.toObject();
        });

        return data ? Machine.fromObject(data) : null;
    }

    async save(machine: Machine): Promise<void> {
        await this.machineDataSource.save(machine);
    }

    async delete(machineId: MachineId): Promise<void> {
        await this.machineDataSource.delete(machineId.getValue());
    }
}
