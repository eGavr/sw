import { AccountId } from "../../../domain/entities/account/account-id";
import { ProviderAccount, ProviderAccountCreateParams } from "../../../domain/entities/provider-account/provider-account";
import { ProviderAccountId } from "../../../domain/entities/provider-account/provider-account-id";

export abstract class ProviderAccountRepository {
    abstract create(params: ProviderAccountCreateParams): Promise<ProviderAccount>;

    abstract get(providerAccountId: ProviderAccountId): Promise<ProviderAccount>;

    abstract listActiveByAccount(accountId: AccountId): Promise<Array<ProviderAccount>>;

    abstract save(providerAccount: ProviderAccount): Promise<void>;
}
