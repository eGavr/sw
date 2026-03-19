import { LocalUser } from "../../../../../../../../src/data/data-sources/resource-provider/local/entities/local-user";
import { UserCollection } from "../../../../../../../../src/data/data-sources/resource-provider/local/entities/user-collection";
import { UserPermissionName } from "../../../../../../../../src/domain/entities/user/user-permission-name";

export class LocalUserFactory {
    static createUserWhoCanCreateAccount(): LocalUser {
        return UserCollection.getInstance().create({ permissions: [UserPermissionName.Account.Create] });
    }

    static createUserWithoutPermissions(): LocalUser {
        return UserCollection.getInstance().create({ permissions: [] });
    }
}
