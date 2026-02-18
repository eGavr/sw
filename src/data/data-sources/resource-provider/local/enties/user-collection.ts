import { NotFoundError } from "../../../../../domain/entities/error/not-found/not-found-error";
import { PermissionName } from "../../../../../domain/entities/permission/permission-name";

import { LocalUser } from "./local-user";

export class UserCollection {
    private static instance: UserCollection

    static getInstance(): UserCollection {
        if (!UserCollection.instance) {
            UserCollection.instance = new UserCollection();
        }

        return UserCollection.instance;
    }

    private users: Array<LocalUser> = [];

    private constructor() {}

    create({ permissions }: { permissions: Array<PermissionName> }): LocalUser {
        const user = new LocalUser(permissions);

        this.users.push(user);

        return user;
    }

    get(externalId: string): LocalUser {
        const user =  this.users.find(user => user.externalId === externalId);
        if (!user) {
            throw new NotFoundError(`user: external id: ${externalId}: not found`);
        }

        return user;
    }

    clear(): void {
        this.users = [];
    }
}
