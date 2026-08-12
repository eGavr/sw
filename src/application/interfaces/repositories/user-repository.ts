import { User } from "../../../domain/entities/user/user";
import { UserCredentials } from "../../../domain/entities/user/user-credentials";

export type FindUserQuery = {
    filter: {
        creds: UserCredentials;
    }
}

export abstract class UserRepository {
    abstract find(params: FindUserQuery): Promise<User | null>;

    abstract save(user: User): Promise<User>;
}
