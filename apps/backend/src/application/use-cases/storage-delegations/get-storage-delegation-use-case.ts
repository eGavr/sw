import { Injectable } from "@nestjs/common";

import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { StorageDelegation, StorageProvider } from "../../interfaces/storage-delegation";
import { AccessControl } from "../../services/access-control";

type GetStorageDelegationInput = {
    creds: {
        token: string;
    };
};

// The storage services the install can write to (and the identity to grant on each) — install-static,
// like the cloud catalogue: it is what the storage setup form offers, so any authenticated caller may
// read it. 404 when the install publishes none (dev writes to local disk).
@Injectable()
export class GetStorageDelegationUseCase {
    constructor(
        private readonly accessControl: AccessControl,
        private readonly storageDelegation: StorageDelegation,
    ) {}

    async execute({ creds }: GetStorageDelegationInput): Promise<ReadonlyArray<StorageProvider>> {
        await this.accessControl.authenticate(creds);

        const providers = this.storageDelegation.providers();

        if (providers.length === 0) {
            throw new NotFoundResourceError("storageDelegation");
        }

        return providers;
    }
}
