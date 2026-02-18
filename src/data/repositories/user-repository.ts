import { Injectable } from "@nestjs/common";

import { User } from "../../domain/entities/user/user";
import { UserCredentials } from "../../domain/entities/user/user-credentials";
import { UserDataSource as UserProviderDataSource } from "../data-sources/auth/user-data-source";
import { UserDataSource } from "../data-sources/database/postgres/user-data-source";

export type FindUserQuery = {
    filter: {
        creds: UserCredentials;
    }
}

@Injectable()
export class UserRepository {
    constructor(
        private readonly userProviderDataSource: UserProviderDataSource,
        private readonly userDataSource: UserDataSource,
    ) {}

    async find(params: FindUserQuery): Promise<User | null> {
        const user = await this.userProviderDataSource.findOne(params);

        if (!user) {
            return null;
        }

        const data = await this.userDataSource.findOne({ externalId: user.id, providerType: user.providerType });

        if (data) {
            return User.fromObject(data);
        }

        return data === null ? User.create({ externalId: user.id, providerType: user.providerType }) : User.fromObject(data);
    }

    async save(user: User): Promise<User> {
        return user;
    }
}
