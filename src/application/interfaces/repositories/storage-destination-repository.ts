import { AccountId } from "../../../domain/entities/account/account-id";
import { StorageDestination } from "../../../domain/entities/storage/storage-destination";

// A single object-storage destination per account (a singleton): where the account's session artifacts
// (logs, later video) are written. `find` returns null when the account has not configured one yet.
export abstract class StorageDestinationRepository {
    abstract find(accountId: AccountId): Promise<StorageDestination | null>;

    abstract save(accountId: AccountId, destination: StorageDestination): Promise<void>;
}
