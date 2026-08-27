import { CloudAccount, CloudAccountCreateParams } from "../../../domain/entities/cloud-account/cloud-account";
import { CloudAccountId } from "../../../domain/entities/cloud-account/cloud-account-id";
import { ProjectId } from "../../../domain/entities/project/project-id";

export abstract class CloudAccountRepository {
    abstract create(params: CloudAccountCreateParams): Promise<CloudAccount>;

    abstract get(cloudAccountId: CloudAccountId): Promise<CloudAccount>;

    abstract listByProject(projectId: ProjectId): Promise<Array<CloudAccount>>;

    abstract listActiveByProject(projectId: ProjectId): Promise<Array<CloudAccount>>;

    abstract save(cloudAccount: CloudAccount): Promise<void>;
}
