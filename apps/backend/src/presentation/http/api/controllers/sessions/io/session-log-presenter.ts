import { StoredObject } from "../../../../../../application/interfaces/gateways/object-storage-gateway";
import { Presenter } from "../../../../presenters/presenter";

// The session's log content, proxied back from the project's storage. Only the bytes — no session id
// (a capability secret) is echoed.
export class SessionLogPresenter implements Presenter {
    constructor(private readonly log: StoredObject) {}

    present(): object {
        return { content: this.log.body.toString("utf8") };
    }
}
