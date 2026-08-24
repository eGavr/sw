import { Injectable } from "@nestjs/common";

import { ProjectId } from "../../../domain/entities/project/project-id";
import { SessionVideoNotFoundError } from "../../../domain/entities/storage/error/session-video-not-found-error";
import { SessionVideoKey } from "../../../domain/entities/storage/session-video-key";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { ObjectStorageGateway, StoredStream } from "../../interfaces/gateways/object-storage-gateway";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { StorageDestinationRepository } from "../../interfaces/repositories/storage-destination-repository";
import { AccessControl } from "../../services/access-control";

type GetSessionVideoInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        // The WebDriver session id (decoded from the caller's session id in the presentation layer).
        webDriverSessionId: string;
    },
}

// Reads a finished session's video back from the project's own storage — a delegated proxy, streaming the
// object straight through under our identity so a large recording is never buffered. The project (durable)
// resolves the bucket, not the environment (which the GC may already have removed).
@Injectable()
export class GetSessionVideoUseCase {
    private readonly permissionName = UserPermissionName.Session.Get;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly storageDestinationRepository: StorageDestinationRepository,
        private readonly objectStorageGateway: ObjectStorageGateway,
    ) {}

    async execute({ creds, params }: GetSessionVideoInput): Promise<StoredStream> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const projectId = ProjectId.fromString(project.id);

        const destination = await this.storageDestinationRepository.find(projectId);

        if (!destination) {
            throw new SessionVideoNotFoundError();
        }

        const key = destination.keyFor(SessionVideoKey.forSession(params.webDriverSessionId));
        const stream = await this.objectStorageGateway.getStream(destination, key);

        if (!stream) {
            throw new SessionVideoNotFoundError();
        }

        return stream;
    }
}
