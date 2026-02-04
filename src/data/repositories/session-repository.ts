import { Injectable } from "@nestjs/common";

import { SessionDataSource } from "../data-sources/ydb/session-data-source";

@Injectable()
export class SessionRepository {
    constructor(private readonly sessionDataSource: SessionDataSource) {}

    async create(): Promise<{ id: string }> {
        return this.sessionDataSource.create();
    }
}
