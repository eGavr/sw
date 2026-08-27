import { ConflictError } from "./conflict-error";

// A client-chosen resource id must be unique among its siblings; a duplicate is rejected (AIP-133).
export class ResourceIdConflictError extends ConflictError {
    constructor(resourceId: string) {
        super(`resource id: ${resourceId}: already in use`);
    }
}
