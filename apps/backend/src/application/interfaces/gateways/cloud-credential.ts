// The resolved secret material for authenticating to an external cloud, carried from the secret store to
// the provider gateway at provision time. It is a secret: toString/JSON are redacted so a stray log line,
// error dump, or serialization can never leak it. Only the adapter, at the auth boundary, calls reveal().
export class CloudCredential {
    private constructor(private readonly material: string) {}

    static of(material: string): CloudCredential {
        return new CloudCredential(material);
    }

    reveal(): string {
        return this.material;
    }

    toString(): string {
        return "[redacted cloud credential]";
    }

    toJSON(): string {
        return "[redacted cloud credential]";
    }
}
