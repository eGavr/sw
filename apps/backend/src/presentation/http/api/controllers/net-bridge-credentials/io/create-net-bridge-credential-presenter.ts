import {
    IssuedNetBridgeCredential,
} from "../../../../../../domain/entities/net-bridge-credential/net-bridge-credential";
import { Presenter } from "../../../../presenters/presenter";

import { NetBridgeCredentialPresenter } from "./net-bridge-credential-presenter";

// The only presenter that carries the plaintext `secret` — returned once, straight from the create result,
// never re-read. Everything else is the ordinary credential metadata.
export class CreateNetBridgeCredentialPresenter implements Presenter {
    constructor(private readonly issued: IssuedNetBridgeCredential) {}

    present(): object {
        return {
            ...new NetBridgeCredentialPresenter(this.issued.credential).present(),
            secret: this.issued.secret.getValue(),
        };
    }
}
