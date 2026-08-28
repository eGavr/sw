import { CloudType } from "../../../../../../application/use-cases/cloud-types/list-cloud-types-use-case";
import { Presenter } from "../../../../presenters/presenter";

// The connectable cloud types and the substrates each provisions — a read-only server-defined catalogue
// (the machineTypes.list / supportedDatabaseFlags.list pattern). A substrate has the same wire shape as a
// cloud account's `provides`, so the UI renders both from one component.
export class ListCloudTypesPresenter implements Presenter {
    constructor(private readonly cloudTypes: Array<CloudType>) {}

    present(): object {
        return {
            cloudTypes: this.cloudTypes.map(({ type, provides }) => ({
                name: `cloudTypes/${type}`,
                type,
                provides: provides.map((stereotype) => ({
                    platform: stereotype.platformName,
                    execution: stereotype.execution,
                })),
            })),
        };
    }
}
