import { ConflictError } from "../../error/conflict-error";

export class NoActiveProviderAccountError extends ConflictError {
    constructor(projectId: string) {
        super(`project: ${projectId}: no active provider project to provision on`);
    }
}
