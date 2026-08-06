import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { Session } from "../../../domain/entities/session/session";
import { SessionId } from "../../../domain/entities/session/session-id";

export abstract class SessionRepository {
    abstract create(session: Session): Promise<Session>;

    abstract get(sessionId: SessionId): Promise<Session>;

    abstract listByEnvironment(environmentId: EnvironmentId): Promise<Array<Session>>;

    abstract delete(sessionId: SessionId): Promise<void>;
}
