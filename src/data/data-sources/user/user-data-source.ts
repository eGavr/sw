import { FindUserQuery } from "../../repositories/user-repository";

export type User = {
    id: string;
}

export abstract class UserDataSource {
    abstract findOne(query: FindUserQuery): Promise<User | null>;
}
