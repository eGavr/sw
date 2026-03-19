import { LocalUser } from "../../../../../../../../src/data/data-sources/resource-provider/local/enties/local-user";
import { UserCollection } from "../../../../../../../../src/data/data-sources/resource-provider/local/enties/user-collection";
import { PermissionName } from "../../../../../../../../src/domain/entities/permission/permission-name";

export class LocalUserFactory {
    static createUserWhoCanCreateAccount(): LocalUser {
        return UserCollection.getInstance().create({ permissions: [PermissionName.Account.Create] });
    }

    static createUserWithoutPermissions(): LocalUser {
        return UserCollection.getInstance().create({ permissions: [] });
    }
}
