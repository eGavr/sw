import { ConflictError } from "../../error/conflict-error";

export class NoActiveProviderAccountError extends ConflictError {
    constructor(accountId: string) {
        super(`account: ${accountId}: no active provider account to provision on`);
    }
}
