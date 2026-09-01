import { Injectable } from "@nestjs/common";

import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { StorageDelegation, StorageDelegationIdentity } from "../../interfaces/storage-delegation";
import { AccessControl } from "../../services/access-control";

type GetStorageDelegationInput = {
    creds: {
        token: string;
    };
};

// The identity to grant bucket access to — install-static, like the cloud catalogue: it is what the
// storage setup form shows, so any authenticated caller may read it. 404 when the install publishes none.
@Injectable()
export class GetStorageDelegationUseCase {
    constructor(
        private readonly accessControl: AccessControl,
        private readonly storageDelegation: StorageDelegation,
    ) {}

    async execute({ creds }: GetStorageDelegationInput): Promise<StorageDelegationIdentity> {
        await this.accessControl.authenticate(creds);

        const identity = this.storageDelegation.identity();

        if (!identity) {
            throw new NotFoundResourceError("storageDelegation");
        }

        return identity;
    }
}
