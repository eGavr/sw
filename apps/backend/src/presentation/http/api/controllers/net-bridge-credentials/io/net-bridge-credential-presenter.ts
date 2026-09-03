import {
    NetBridgeCredential,
} from "../../../../../../domain/entities/net-bridge-credential/net-bridge-credential";
import { Presenter } from "../../../../presenters/presenter";

// The wire shape of a NetBridge credential — metadata only. The secret and its hash are never exposed:
// the plaintext is shown once by the create presenter, and the hash never leaves the data layer.
export class NetBridgeCredentialPresenter implements Presenter {
    constructor(private readonly credential: NetBridgeCredential) {}

    present(): object {
        return {
            name: `projects/${this.credential.projectId.getValue()}/netBridgeCredentials/${this.credential.id}`,
            uid: this.credential.id,
            displayName: this.credential.name ?? undefined,
            createTime: this.credential.createdAt.toISOString(),
            expireTime: this.credential.expiresAt?.toISOString(),
            lastUseTime: this.credential.lastUsedAt?.toISOString(),
        };
    }
}
