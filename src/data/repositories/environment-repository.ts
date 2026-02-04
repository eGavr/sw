import { Injectable } from "@nestjs/common";

import { EnvironmentDataSource } from "../data-sources/ydb/environment-data-source";

@Injectable()
export class EnvironmentRepository {
    constructor(private readonly environmentDataSource: EnvironmentDataSource) {}

    async get(environmentId: string): Promise<{ id: string }> {
        return this.environmentDataSource.get(environmentId);
    }
}
