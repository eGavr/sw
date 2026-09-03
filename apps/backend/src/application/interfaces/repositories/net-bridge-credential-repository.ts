import {
    NetBridgeCredential,
} from "../../../domain/entities/net-bridge-credential/net-bridge-credential";
import {
    NetBridgeCredentialId,
} from "../../../domain/entities/net-bridge-credential/net-bridge-credential-id";
import { ProjectId } from "../../../domain/entities/project/project-id";

export abstract class NetBridgeCredentialRepository {
    abstract get(id: NetBridgeCredentialId): Promise<NetBridgeCredential>;

    abstract listByProject(projectId: ProjectId): Promise<Array<NetBridgeCredential>>;

    // The caller builds the aggregate via NetBridgeCredential.create, so save covers create and update.
    abstract save(credential: NetBridgeCredential): Promise<void>;

    // A real delete — this is how a credential is revoked.
    abstract delete(id: NetBridgeCredentialId): Promise<void>;
}
