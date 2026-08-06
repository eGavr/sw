import { Injectable } from "@nestjs/common";

import { SessionData } from "../../../../domain/entities/session/session";
import { SessionDataSource } from "../session-data-source";

import { LocalComputeStore } from "./local-compute-store";

@Injectable()
export class LocalSessionDataSource extends SessionDataSource {
    constructor(private readonly store: LocalComputeStore) {
        super();
    }

    async create(session: SessionData): Promise<SessionData> {
        return this.store.saveSession(session);
    }

    async get(id: string): Promise<SessionData | null> {
        return this.store.getSession(id);
    }

    async listByEnvironment(environmentId: string): Promise<Array<SessionData>> {
        return this.store.listSessionsByEnvironment(environmentId);
    }

    async delete(id: string): Promise<void> {
        this.store.removeSession(id);
    }
}
