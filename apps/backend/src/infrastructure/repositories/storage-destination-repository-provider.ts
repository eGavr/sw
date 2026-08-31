import {
    StorageDestinationRepository,
} from "../../application/interfaces/repositories/storage-destination-repository";

import { StorageDestinationRepositoryImpl } from "./storage-destination-repository-impl";

// The storage destination is the honest configured value everywhere: unset means unset (a 404 on read,
// no artifacts on write), on every install. Dev configures a destination once through Settings, exactly
// like prod — no synthetic default that would show a phantom bucket and un-remove itself on reload.
export const StorageDestinationRepositoryProvider = {
    provide: StorageDestinationRepository,
    useClass: StorageDestinationRepositoryImpl,
};
