import { ProjectId } from "../../../domain/entities/project/project-id";
import { StorageDestination } from "../../../domain/entities/storage/storage-destination";

// A single object-storage destination per project (a singleton): where the project's session artifacts
// (logs, later video) are written. `find` returns null when the project has not configured one yet.
export abstract class StorageDestinationRepository {
    abstract find(projectId: ProjectId): Promise<StorageDestination | null>;

    abstract save(projectId: ProjectId, destination: StorageDestination): Promise<void>;
}
