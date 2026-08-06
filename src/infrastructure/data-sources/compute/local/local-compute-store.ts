import { Injectable } from "@nestjs/common";

import { EnvironmentData } from "../../../../domain/entities/environment/environment";
import { SessionData } from "../../../../domain/entities/session/session";

// In-memory single-node compute backend. It is the source of truth for live state within one process.
// NOTE: the api and wd services run as separate processes, so this store is NOT shared across them;
// the cross-process compute backend is Docker (added behind the same data-source port).
@Injectable()
export class LocalComputeStore {
    private readonly environments = new Map<string, EnvironmentData>();
    private readonly sessions = new Map<string, SessionData>();

    saveEnvironment(environment: EnvironmentData): EnvironmentData {
        const stored: EnvironmentData = {
            ...environment,
            endpoint: environment.endpoint ?? `local://environments/${environment.id}`,
        };

        this.environments.set(stored.id, stored);

        return stored;
    }

    getEnvironment(id: string): EnvironmentData | null {
        return this.environments.get(id) ?? null;
    }

    listEnvironmentsByAccount(accountId: string): Array<EnvironmentData> {
        return [...this.environments.values()].filter((environment) => environment.accountId === accountId);
    }

    removeEnvironment(id: string): void {
        this.environments.delete(id);
    }

    saveSession(session: SessionData): SessionData {
        this.sessions.set(session.id, session);

        return session;
    }

    getSession(id: string): SessionData | null {
        return this.sessions.get(id) ?? null;
    }

    listSessionsByEnvironment(environmentId: string): Array<SessionData> {
        return [...this.sessions.values()].filter((session) => session.environmentId === environmentId);
    }

    removeSession(id: string): void {
        this.sessions.delete(id);
    }
}
