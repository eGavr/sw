import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { SessionOwnership } from "../../../domain/entities/session/session-ownership";

export abstract class SessionOwnershipRepository {
    // Upsert: an environment holds at most one session, so a new session simply replaces the owner.
    abstract save(ownership: SessionOwnership): Promise<void>;

    abstract findByEnvironment(environmentId: EnvironmentId): Promise<SessionOwnership | null>;

    // The batch companion of findByEnvironment for one listing page.
    abstract listByEnvironments(environmentIds: ReadonlyArray<EnvironmentId>): Promise<Array<SessionOwnership>>;

    abstract deleteByEnvironment(environmentId: EnvironmentId): Promise<void>;
}
