import { SessionData } from "../../../domain/entities/session/session";

export abstract class SessionDataSource {
    abstract create(session: SessionData): Promise<SessionData>;
    abstract get(id: string): Promise<SessionData | null>;
    abstract listByEnvironment(environmentId: string): Promise<Array<SessionData>>;
    abstract delete(id: string): Promise<void>;
}
