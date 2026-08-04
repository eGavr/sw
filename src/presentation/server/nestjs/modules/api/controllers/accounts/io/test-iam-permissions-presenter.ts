import { UserPermissionName } from "../../../../../../../../domain/entities/user/user-permission-name";
import { Presenter } from "../../../../../presenters/presenter";

export class TestIamPermissionsPresenter implements Presenter {
    constructor(private readonly permissions: ReadonlyArray<UserPermissionName>) {}

    present(): object {
        return {
            permissions: [...this.permissions],
        };
    }
}
