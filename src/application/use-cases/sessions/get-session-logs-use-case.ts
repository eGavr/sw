import { Injectable } from "@nestjs/common";

import { ProjectId } from "../../../domain/entities/project/project-id";
import { SessionLogNotFoundError } from "../../../domain/entities/storage/error/session-log-not-found-error";
import { SessionLogKey } from "../../../domain/entities/storage/session-log-key";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { ObjectStorageGateway, StoredObject } from "../../interfaces/gateways/object-storage-gateway";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { StorageDestinationRepository } from "../../interfaces/repositories/storage-destination-repository";
import { AccessControl } from "../../services/access-control";

type GetSessionLogsInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        // The WebDriver session id (decoded from the caller's session id in the presentation layer); the
        // log is addressed by its fingerprint, so the raw secret is never persisted or matched directly.
        webDriverSessionId: string;
    },
}

// Reads a finished session's logs back from the project's own storage — we are a delegated proxy: fetch
// under our identity, return the bytes. The project (durable) resolves the bucket, not the environment
// (which the GC may already have removed), so the log outlives its environment.
@Injectable()
export class GetSessionLogsUseCase {
    private readonly permissionName = UserPermissionName.Session.Get;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly storageDestinationRepository: StorageDestinationRepository,
        private readonly objectStorageGateway: ObjectStorageGateway,
    ) {}

    async execute({ creds, params }: GetSessionLogsInput): Promise<StoredObject> {
        const user = await this.accessControl.authenticate(creds);
        const projectId = ProjectId.fromString(params.projectId);
        const project = await this.projectRepository.get(projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const destination = await this.storageDestinationRepository.find(projectId);
        const object = destination
            ? await this.objectStorageGateway.get(destination, destination.keyFor(SessionLogKey.forSession(params.webDriverSessionId)))
            : null;

        if (!object) {
            throw new SessionLogNotFoundError();
        }

        return object;
    }
}
