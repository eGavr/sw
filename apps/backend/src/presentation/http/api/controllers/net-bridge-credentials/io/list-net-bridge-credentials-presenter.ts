import {
    NetBridgeCredential,
} from "../../../../../../domain/entities/net-bridge-credential/net-bridge-credential";
import { Presenter } from "../../../../presenters/presenter";

import { NetBridgeCredentialPresenter } from "./net-bridge-credential-presenter";

// A project holds only a handful of keys, so the collection is returned whole (no pagination).
export class ListNetBridgeCredentialsPresenter implements Presenter {
    constructor(private readonly credentials: Array<NetBridgeCredential>) {}

    present(): object {
        return {
            netBridgeCredentials: this.credentials.map(
                (credential) => new NetBridgeCredentialPresenter(credential).present(),
            ),
        };
    }
}
