import { Injectable } from "@nestjs/common";

import { FindUserQuery, UserRepository } from "../../application/interfaces/repositories/user-repository";
import { User } from "../../domain/entities/user/user";
import { UserDataSource as UserProviderDataSource } from "../data-sources/auth/user-data-source";
import { UserDataSource } from "../data-sources/database/postgres/user-data-source";

@Injectable()
export class UserRepositoryImpl extends UserRepository {
    constructor(
        private readonly userProviderDataSource: UserProviderDataSource,
        private readonly userDataSource: UserDataSource,
    ) {
        super();
    }

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
