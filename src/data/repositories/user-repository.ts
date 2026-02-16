import { Injectable } from "@nestjs/common";

import { User } from "../../domain/entities/user/user";
import { UserCredentials } from "../../domain/entities/user/user-credentials";
import { UserDataSource } from "../data-sources/user/user-data-source";

export type FindUserQuery = {
    filter: {
        creds: UserCredentials;
    }
}

@Injectable()
export class UserRepository {
    constructor(
        private readonly userDataSource: UserDataSource,
    ) {}

    async find(params: FindUserQuery): Promise<User | null> {
        const user = await this.userDataSource.findOne(params);

        if (!user) {
            return null;
        }

        return User.create({ externalId: user.id });
    }

    async save(user: User): Promise<User> {
        return user;
    }
}
