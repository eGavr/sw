// A storage service the install can write session artifacts to under its OWN published identity — the
// user picks one and grants that identity on their bucket (delegated: we hold none of their keys). The
// set is what the install's identities can actually reach: one entry today (Yandex Object Storage);
// another cloud's storage appears here once we hold an identity there (multi-provider follow-up).
export type StorageProviderGrant = {
    readonly serviceAccountId: string;
    readonly role: string;
    readonly purpose: string;
};

export type StorageProvider = {
    readonly id: string;
    readonly displayName: string;
    readonly endpoint: string;
    readonly region: string;
    readonly grant: StorageProviderGrant;
};

export abstract class StorageDelegation {
    abstract providers(): ReadonlyArray<StorageProvider>;
}
