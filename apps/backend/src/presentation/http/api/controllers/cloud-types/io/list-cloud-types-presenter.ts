import { CloudType } from "../../../../../../application/use-cases/cloud-types/list-cloud-types-use-case";
import { Presenter } from "../../../../presenters/presenter";

// The connectable cloud types: for each, the substrates it offers with every compute kind that can run
// them — the kind, the binding-config keys it requires (with the format that catches typos at the
// input), the grants to set up, and how the user proves they own the resource (ownershipProof). The
// whole connect-and-bind form renders from this.
export class ListCloudTypesPresenter implements Presenter {
    constructor(private readonly cloudTypes: Array<CloudType>) {}

    present(): object {
        return {
            cloudTypes: this.cloudTypes.map(({ type, provides }) => ({
                name: `cloudTypes/${type}`,
                type,
                provides: provides.map((offer) => ({
                    platform: offer.stereotype.platformName,
                    execution: offer.stereotype.execution,
                    compute: offer.compute.map((kindOffer) => ({
                        kind: kindOffer.kind,
                        requiredConfig: kindOffer.requiredConfig.map(({ key, pattern }) => ({ key, pattern })),
                        grants: kindOffer.grants.map(presentGrant),
                        ownershipProof: kindOffer.ownershipProof,
                    })),
                })),
            })),
        };
    }
}

function presentGrant(grant: { role: string; serviceAccountId: string }): object {
    return { role: grant.role, serviceAccountId: grant.serviceAccountId };
}
