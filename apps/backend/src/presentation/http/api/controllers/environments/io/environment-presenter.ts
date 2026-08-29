import { Environment } from "../../../../../../domain/entities/environment/environment";
import { Presenter } from "../../../../presenters/presenter";

export class EnvironmentPresenter implements Presenter {
    // `projectHandle` is the identifier the caller used for the project (its human id or uid), echoed in
    // the resource name; the environment is addressed by its own human id when set, else its uid.
    constructor(
        private readonly environment: Environment,
        private readonly projectHandle: string,
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
            applications: this.environment.applications.toArray(),
            // Occupancy is orthogonal to lifecycle (a session never changes `state`); busy/liveness rules
            // live in the entity. Not secrets — the session id is.
            busy: this.environment.isBusy(),
            ...(this.environment.lastHeartbeatAt
                ? { lastHeartbeatTime: this.environment.lastHeartbeatAt.toISOString() }
                : {}),
            createTime: this.environment.createdAt.toISOString(),
        };
    }
}
