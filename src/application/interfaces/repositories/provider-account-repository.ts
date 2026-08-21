import { ProjectId } from "../../../domain/entities/project/project-id";
import { ProviderAccount, ProviderAccountCreateParams } from "../../../domain/entities/provider-account/provider-account";
import { ProviderAccountId } from "../../../domain/entities/provider-account/provider-account-id";

export abstract class ProviderAccountRepository {
    abstract create(params: ProviderAccountCreateParams): Promise<ProviderAccount>;

    abstract get(providerAccountId: ProviderAccountId): Promise<ProviderAccount>;

    abstract listByProject(projectId: ProjectId): Promise<Array<ProviderAccount>>;

    abstract listActiveByProject(projectId: ProjectId): Promise<Array<ProviderAccount>>;

    abstract save(providerAccount: ProviderAccount): Promise<void>;
}
