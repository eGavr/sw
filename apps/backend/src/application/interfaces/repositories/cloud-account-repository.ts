import { CloudAccount } from "../../../domain/entities/cloud-account/cloud-account";
import { CloudAccountId } from "../../../domain/entities/cloud-account/cloud-account-id";
import { ProjectId } from "../../../domain/entities/project/project-id";

export abstract class CloudAccountRepository {
    abstract get(cloudAccountId: CloudAccountId): Promise<CloudAccount>;

    abstract listByProject(projectId: ProjectId): Promise<Array<CloudAccount>>;

    abstract listActiveByProject(projectId: ProjectId): Promise<Array<CloudAccount>>;

    // Create and update both go through save (the aggregate is built by the caller via CloudAccount.create,
    // so cross-aggregate invariants like non-overlap can be checked before persisting).
    abstract save(cloudAccount: CloudAccount): Promise<void>;
}
