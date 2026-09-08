import { createHash, randomBytes } from "node:crypto";

import { MintedRegistrationToken, RegistrationTokenService } from "../../application/interfaces/registration-token-service";

const tokenBytes = 32;

// 256 random bits, url-safe, kept only as a SHA-256 — a leaked table gives away no usable token.
export class Sha256RegistrationTokenService extends RegistrationTokenService {
    mint(): MintedRegistrationToken {
        const token = randomBytes(tokenBytes).toString("base64url");

        return { token, hash: this.hash(token) };
    }

    hash(token: string): string {
        return createHash("sha256").update(token).digest("hex");
    }
}
