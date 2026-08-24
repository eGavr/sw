import { Environment } from "../../../../../../domain/entities/environment/environment";
import { Presenter } from "../../../../presenters/presenter";

import { EnvironmentPresenter } from "./environment-presenter";

export class ListEnvironmentsPresenter implements Presenter {
    constructor(
        private readonly environments: Array<Environment>,
        private readonly projectHandle: string,
        private readonly nextPageToken?: string,
    ) {}

    present(): object {
        return {
            environments: this.environments.map(
                (environment) => new EnvironmentPresenter(environment, this.projectHandle).present(),
            ),
            nextPageToken: this.nextPageToken,
        };
    }
}
