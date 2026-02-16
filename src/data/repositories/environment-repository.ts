import { Injectable } from "@nestjs/common";

import { Environment } from "../../domain/entities/environment/environment";
import { EnvironmentDataSource } from "../data-sources/ydb/environment-data-source";

@Injectable()
export class EnvironmentRepository {
    constructor(private readonly _environmentDataSource: EnvironmentDataSource) {}

    async get(environmentId: string): Promise<Environment> {
        return Environment.fromObject({ id: environmentId });
    }
}
