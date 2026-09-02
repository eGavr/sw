import { CloudType } from "../../../../../../application/use-cases/cloud-types/list-cloud-types-use-case";
import { Presenter } from "../../../../presenters/presenter";

// The connectable cloud types: for each, the substrates it offers with every compute kind that can run
// them (kind + the binding-config keys it requires + the grants to set up), plus the account-level
// connect requirements. The whole connect form renders from this.
export class ListCloudTypesPresenter implements Presenter {
    constructor(private readonly cloudTypes: Array<CloudType>) {}

    present(): object {
        return {
            cloudTypes: this.cloudTypes.map(({ type, provides, connect }) => ({
                name: `cloudTypes/${type}`,
                type,
                provides: provides.map((offer) => ({
                    platform: offer.stereotype.platformName,
                    execution: offer.stereotype.execution,
                    compute: offer.compute.map((kindOffer) => ({
                        kind: kindOffer.kind,
                        requiredConfig: [...kindOffer.requiredConfig],
                        grants: kindOffer.grants.map(presentGrant),
                    })),
                })),
                connect: {
                    requiredConfig: [...connect.requiredConfig],
                    grants: connect.grants.map(presentGrant),
                },
            })),
        };
    }
}

function presentGrant(grant: { role: string; serviceAccountId: string }): object {
    return { role: grant.role, serviceAccountId: grant.serviceAccountId };
}
