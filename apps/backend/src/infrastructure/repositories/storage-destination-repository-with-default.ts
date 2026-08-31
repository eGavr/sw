import { StorageDestinationRepository } from "../../application/interfaces/repositories/storage-destination-repository";
import { ProjectId } from "../../domain/entities/project/project-id";
import { StorageDestination } from "../../domain/entities/storage/storage-destination";

// Install policy, applied at the composition root — never in a use case or data source: on a
// local-disk install every project can take artifacts, so a project that has not configured its own
// destination defaults to its own storage area, named by nothing more inventive than the project id.
// Writes pass through untouched — configuring a real destination still creates the project's own
// row, which then wins.
export class StorageDestinationRepositoryWithDefault extends StorageDestinationRepository {
    constructor(private readonly base: StorageDestinationRepository) {
        super();
    }

    async find(projectId: ProjectId): Promise<StorageDestination | null> {
        return (await this.base.find(projectId)) ?? StorageDestination.create({ bucket: projectId.getValue() });
    }

    save(projectId: ProjectId, destination: StorageDestination): Promise<void> {
        return this.base.save(projectId, destination);
    }

    delete(projectId: ProjectId): Promise<void> {
        return this.base.delete(projectId);
    }
}
