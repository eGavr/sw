import { Injectable } from "@nestjs/common";

import { CloudCatalog, SubstrateOffer } from "../../interfaces/cloud-catalog";
import { AccessControl } from "../../services/access-control";

type ListCloudTypesInput = {
    creds: {
        token: string;
    },
}

export type CloudType = {
    readonly type: string;
    readonly provides: ReadonlyArray<SubstrateOffer>;
};

@Injectable()
export class ListCloudTypesUseCase {
    constructor(
        private readonly accessControl: AccessControl,
        private readonly cloudCatalog: CloudCatalog,
    ) {}

    // The catalogue is install-static and not project-scoped — it is what a connect-cloud form offers —
    // so any authenticated caller may read it.
    async execute({ creds }: ListCloudTypesInput): Promise<Array<CloudType>> {
        await this.accessControl.authenticate(creds);

        return this.cloudCatalog.types().map((type) => ({
            type,
            provides: this.cloudCatalog.substrateOffers(type),
        }));
    }
}
