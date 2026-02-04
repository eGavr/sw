import { Injectable } from "@nestjs/common";

import { YdbClient } from "./ydb-client";

@Injectable()
export class EnvironmentDataSource {
    constructor(private ydbClient: YdbClient) {}

    async get(environmentId: string): Promise<{ id: string }> {
        return this.ydbClient.get(environmentId);
    }
}
