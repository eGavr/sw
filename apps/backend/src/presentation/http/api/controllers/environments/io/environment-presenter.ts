import { Environment } from "../../../../../../domain/entities/environment/environment";
import { Presenter } from "../../../../presenters/presenter";

export class EnvironmentPresenter implements Presenter {
    // `projectHandle` is the identifier the caller used for the project (its human id or uid), echoed in
    // the resource name; the environment is addressed by its own human id when set, else its uid.
    // `canAccessCurrentSession` is a caller-dependent capability (the Drive files.capabilities pattern):
    // set only when the caller created the environment's current session.
    constructor(
        private readonly environment: Environment,
        private readonly projectHandle: string,
        private readonly canAccessCurrentSession: boolean = false,
    ) {}

    present(): object {
        const reason = this.environment.stateReason;
        const handle = this.environment.resourceId ?? this.environment.id;

        return {
            name: `projects/${this.projectHandle}/environments/${handle}`,
            uid: this.environment.id,
            state: this.environment.effectiveStatus(),
            ...(reason ? { stateReason: reason } : {}),
            platform: this.environment.platform.toObject(),
            execution: this.environment.execution,
            // A custom's refs are the project's own bucket keys and are echoed; a provided build's
            // artifact locations are the install's internals and stay private (only the provenance shows).
            applications: this.environment.applications.toArray().map(({ name, version, source }) => ({
                name,
                version,
                source: source?.type === "custom" ? source : { type: "provided" },
            })),
            // Occupancy is orthogonal to lifecycle (a session never changes `state`); the liveness rules
            // live in the entity. Not secrets — the session id is.
            occupancy: this.environment.effectiveOccupancy().toUpperCase(),
            ...(this.canAccessCurrentSession ? { capabilities: { canAccessCurrentSession: true } } : {}),
            ...(this.environment.lastHeartbeatAt
                ? { lastHeartbeatTime: this.environment.lastHeartbeatAt.toISOString() }
                : {}),
            createTime: this.environment.createdAt.toISOString(),
        };
    }
}
