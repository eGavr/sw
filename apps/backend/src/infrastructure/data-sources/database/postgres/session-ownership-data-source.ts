import { Injectable } from "@nestjs/common";
import { DataSource, In } from "typeorm";

import {
    SessionOwnership as SessionOwnershipEntity,
    SessionOwnershipData,
} from "../../../../domain/entities/session/session-ownership";

import { SessionOwnership } from "./typeorm/entities/session-ownership/session-ownership";

@Injectable()
export class SessionOwnershipDataSource {
    constructor(private readonly dataSource: DataSource) {}

    // The environment id is the primary key, so save() is a natural upsert: a new session's ownership
    // replaces the previous one.
    async save(ownership: SessionOwnershipEntity): Promise<void> {
        await this.dataSource.getRepository(SessionOwnership).save(SessionOwnership.from(ownership));
    }

    async findByEnvironment(environmentId: string): Promise<SessionOwnershipData | null> {
        const ownership = await this.dataSource.getRepository(SessionOwnership).findOne({ where: { environmentId } });

        return ownership?.toObject() ?? null;
    }

    async listByEnvironments(environmentIds: Array<string>): Promise<Array<SessionOwnershipData>> {
        if (environmentIds.length === 0) {
            return [];
        }

        const ownerships = await this.dataSource.getRepository(SessionOwnership).find({
            where: { environmentId: In(environmentIds) },
        });

        return ownerships.map((ownership) => ownership.toObject());
    }

    async deleteByEnvironment(environmentId: string): Promise<void> {
        await this.dataSource.getRepository(SessionOwnership).delete({ environmentId });
    }
}
