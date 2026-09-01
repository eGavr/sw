import { CloudType } from "../../../../../../application/use-cases/cloud-types/list-cloud-types-use-case";
import { Presenter } from "../../../../presenters/presenter";

// The connectable cloud types and the substrates each provisions — a read-only server-defined catalogue
// (the machineTypes.list / supportedDatabaseFlags.list pattern). A substrate has the same wire shape as a
// cloud account's `provides`, so the UI renders both from one component.
export class ListCloudTypesPresenter implements Presenter {
    constructor(private readonly cloudTypes: Array<CloudType>) {}

    present(): object {
        return {
            cloudTypes: this.cloudTypes.map(({ type, provides, connect }) => ({
                name: `cloudTypes/${type}`,
                type,
                provides: provides.map((stereotype) => ({
                    platform: stereotype.platformName,
                    execution: stereotype.execution,
                })),
                // What connecting this type asks of the user: config keys they must fill and the grants to
                // set up on their cloud for our published identities (delegated BYOC — no secrets here).
                connect: {
                    requiredConfig: [...connect.requiredConfig],
                    grants: connect.grants.map((grant) => ({
                        role: grant.role,
                        serviceAccountId: grant.serviceAccountId,
                        purpose: grant.purpose,
                    })),
                },
            })),
        };
    }
}
