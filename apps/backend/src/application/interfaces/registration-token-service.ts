// A freshly minted registration token: the plaintext goes into the install command exactly once, the
// hash is what the machine keeps to recognise it.
export type MintedRegistrationToken = {
    readonly token: string;
    readonly hash: string;
};

// The one-time secret an install command carries (kubeadm's bootstrap token): unguessable, stored only
// as a hash, spent on the agent's first contact in exchange for the machine token.
export abstract class RegistrationTokenService {
    abstract mint(): MintedRegistrationToken;

    abstract hash(token: string): string;
}
