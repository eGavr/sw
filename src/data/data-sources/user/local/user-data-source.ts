import { FindUserQuery } from "../../../repositories/user-repository";
import { UserDataSource } from "../user-data-source";

import { User } from "./entities/user";

export class LocalUserDataSource extends UserDataSource {
    async findOne(query: FindUserQuery): Promise<User | null> {
        return User.from(query.filter.creds.token);
    }
}
