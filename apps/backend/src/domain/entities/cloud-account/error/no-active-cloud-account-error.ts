import { ConflictError } from "../../error/conflict-error";

export class NoActiveCloudAccountError extends ConflictError {
    constructor(projectId: string) {
        super(`project: ${projectId}: no active cloud account provisions this substrate`);
    }
}
