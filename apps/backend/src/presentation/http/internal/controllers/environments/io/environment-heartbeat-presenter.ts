import { Environment } from "../../../../../../domain/entities/environment/environment";
import { Presenter } from "../../../../presenters/presenter";

export class EnvironmentHeartbeatPresenter implements Presenter {
    constructor(private readonly environment: Environment) {}

    present(): object {
        return {
            uid: this.environment.id,
            state: this.environment.effectiveStatus(),
        };
    }
}
