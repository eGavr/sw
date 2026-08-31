// Driven port over a secret store (Yandex Lockbox in prod; an in-memory/fs fake in dev/test). It holds
// opaque secret material — a cloud account's credentials — and hands back a reference. The reference, not
// the secret, is what we persist (CloudAccount.credentialRef); the secret itself never reaches the domain,
// a presenter, or a log. store returns a fresh reference; resolve reads the material back for provisioning
// (null when the reference is unknown); delete removes it when the cloud is disconnected.
export abstract class SecretStore {
    abstract store(material: string): Promise<string>;

    abstract resolve(reference: string): Promise<string | null>;

    abstract delete(reference: string): Promise<void>;
}
