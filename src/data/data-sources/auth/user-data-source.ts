import { FindUserQuery } from "../../repositories/user-repository";

export type User = {
    id: string;
    providerType: string;
}

export abstract class UserDataSource {
    abstract findOne(query: FindUserQuery): Promise<User | null>;
}
