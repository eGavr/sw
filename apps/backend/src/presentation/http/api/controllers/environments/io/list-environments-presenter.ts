import { EnvironmentView } from "../../../../../../application/use-cases/environments/environment-view";
import { Presenter } from "../../../../presenters/presenter";

import { EnvironmentPresenter } from "./environment-presenter";

export class ListEnvironmentsPresenter implements Presenter {
    constructor(
        private readonly environments: Array<EnvironmentView>,
        private readonly projectHandle: string,
        private readonly nextPageToken?: string,
    ) {}

    present(): object {
        return {
            environments: this.environments.map(
                (view) => new EnvironmentPresenter(view.environment, this.projectHandle, view.canAccessCurrentSession)
                    .present(),
            ),
            nextPageToken: this.nextPageToken,
        };
    }
}
