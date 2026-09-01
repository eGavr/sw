// The install's published storage identity: the service account we write session artifacts with. The user
// grants it access on THEIR bucket (delegated — we hold none of their keys), so the bucket setup UI must
// be able to show who to grant and why. Null when the install publishes none (local dev writes to disk).
export type StorageDelegationIdentity = {
    readonly serviceAccountId: string;
    readonly role: string;
    readonly purpose: string;
};

export abstract class StorageDelegation {
    abstract identity(): StorageDelegationIdentity | null;
}
