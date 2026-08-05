import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

import { Environment as EnvironmentEntity, EnvironmentData } from "../../../../domain/entities/environment/environment";

import { Environment } from "./typeorm/entities/environment/environment";
import { EnvironmentApplication } from "./typeorm/entities/environment/environment-application";

@Injectable()
export class EnvironmentDataSource {
    constructor(private readonly dataSource: DataSource) {}

    async create(environment: EnvironmentEntity): Promise<void> {
        const entity = Environment.from(environment);

        await this.dataSource.transaction(async (manager) => {
            await manager.getRepository(Environment).save(entity);
            await manager.getRepository(EnvironmentApplication).save(entity.applications);
        });
    }

    async save(environment: EnvironmentEntity): Promise<void> {
        const data = environment.toObject();

        await this.dataSource.getRepository(Environment).update(data.id, {
            state: data.state,
            stateReason: data.stateReason ?? null,
            endpoint: data.endpoint ?? null,
            busy: data.busy,
            lastHeartbeatAt: data.lastHeartbeatAt ?? null,
            updatedAt: data.updatedAt,
        });
    }

    async findOne(id: string): Promise<EnvironmentData | null> {
        const environment = await this.dataSource.getRepository(Environment).findOne({ where: { id } });

        return environment?.toObject() ?? null;
    }

    async findAllByAccount(accountId: string): Promise<Array<EnvironmentData>> {
        const environments = await this.dataSource.getRepository(Environment).find({ where: { accountId } });

        return environments.map((environment) => environment.toObject());
    }
}
