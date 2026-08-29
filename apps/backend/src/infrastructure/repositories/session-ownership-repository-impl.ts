import { Injectable } from "@nestjs/common";

import { SessionOwnershipRepository } from "../../application/interfaces/repositories/session-ownership-repository";
import { EnvironmentId } from "../../domain/entities/environment/environment-id";
import { SessionOwnership } from "../../domain/entities/session/session-ownership";
import { SessionOwnershipDataSource } from "../data-sources/database/postgres/session-ownership-data-source";

@Injectable()
export class SessionOwnershipRepositoryImpl extends SessionOwnershipRepository {
    constructor(private readonly sessionOwnershipDataSource: SessionOwnershipDataSource) {
        super();
    }

    async save(ownership: SessionOwnership): Promise<void> {
        await this.sessionOwnershipDataSource.save(ownership);
    }

    async findByEnvironment(environmentId: EnvironmentId): Promise<SessionOwnership | null> {
        const data = await this.sessionOwnershipDataSource.findByEnvironment(environmentId.getValue());

        return data ? SessionOwnership.fromObject(data) : null;
    }

    async listByEnvironments(environmentIds: ReadonlyArray<EnvironmentId>): Promise<Array<SessionOwnership>> {
        const data = await this.sessionOwnershipDataSource.listByEnvironments(
            environmentIds.map((id) => id.getValue()),
        );

        return data.map(SessionOwnership.fromObject);
    }

    async deleteByEnvironment(environmentId: EnvironmentId): Promise<void> {
        await this.sessionOwnershipDataSource.deleteByEnvironment(environmentId.getValue());
    }
}
