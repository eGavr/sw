import { Account, AccountCreateParams } from "../../../domain/entities/account/account";
import { AccountId } from "../../../domain/entities/account/account-id";
import { User } from "../../../domain/entities/user/user";

export abstract class AccountRepository {
    abstract get(accountId: AccountId): Promise<Account>;

    abstract find(accountId: AccountId): Promise<Account | null>;

    abstract listByUser(user: User): Promise<Array<Account>>;

    abstract create(params: AccountCreateParams): Promise<Account>;

    abstract save(account: Account): Promise<Account>;
}
